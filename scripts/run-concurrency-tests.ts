#!/usr/bin/env tsx
/**
 * The Phase 2 exit gate: double-booking must be impossible under concurrency.
 *
 *   npm run test:concurrency
 *   npm run test:concurrency -- --repeat 10
 *
 * ## Why this is not in tests/db
 *
 * Every file in tests/db runs inside one transaction that is rolled back, on
 * one connection. That is exactly the wrong shape for this: two sessions
 * racing for a slot can only race if both are really committing, and an
 * uncommitted row is invisible to the other session's `SELECT` while still
 * being visible to the exclusion constraint. The interesting behaviour — one
 * winner, everyone else a clean refusal — only exists across connections.
 *
 * So this harness commits. It creates its own tenant with a random slug,
 * races against it, and deletes it afterwards; `ON DELETE CASCADE` from
 * `businesses` takes the bookings, customers, staff and rules with it. That
 * makes it safe to point at a staging project as well as at CI's container.
 *
 * ## What "passes" means
 *
 * Not "no errors". A refusal is the correct outcome for 49 of 50 callers, and
 * a run where everything succeeded would mean the constraint had stopped
 * working. Each race asserts the exact number of winners.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import { Client, type ClientConfig } from "pg";
import { redactDbUrl, resolveDbUrl } from "./lib/db-url";

const REPEAT = (() => {
  const i = process.argv.indexOf("--repeat");
  const n = i >= 0 ? Number(process.argv[i + 1]) : 1;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
})();

const DB_URL = resolveDbUrl();

function clientConfig(): ClientConfig {
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(DB_URL);
  if (isLocal) return { connectionString: DB_URL };
  const ca = process.env.PGSSLROOTCERT;
  return {
    connectionString: DB_URL,
    ssl: ca ? { ca: readFileSync(ca, "utf8") } : { rejectUnauthorized: false },
  };
}

async function connect(): Promise<Client> {
  const c = new Client(clientConfig());
  await c.connect();
  return c;
}

interface World {
  businessId: string;
  serviceId: string;
  staff: string[];
  day: string;
}

/**
 * A tenant of its own, so a race cannot be perturbed by whatever else is in
 * the database, and so the cleanup is one DELETE.
 *
 * Open seven days a week with no breaks: this harness is testing the
 * constraint under load, and a provider who is off on Fridays would just make
 * the arithmetic harder to read.
 */
async function createWorld(client: Client, staffCount: number): Promise<World> {
  const suffix = randomUUID().slice(0, 8);

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO businesses
         (slug, name, business_type, phone, email, timezone, currency, plan_id,
          onboarding_step, onboarding_completed_at, booking_rules)
     VALUES ($1, $2, 'dentist', '+8801700000000', $3, 'Asia/Dhaka', 'BDT',
             (SELECT id FROM subscription_plans WHERE code = 'enterprise'),
             'complete', NOW(),
             '{"min_reschedule_hours":0,"min_cancel_hours":0,"max_advance_days":60,
               "slot_interval_minutes":15,"min_lead_minutes":60,"max_reschedules":5,
               "auto_confirm":true,"max_active_per_customer":1000}'::jsonb)
     RETURNING id`,
    [`concurrency-${suffix}`, `Concurrency ${suffix}`, `race-${suffix}@example.com`],
  );
  const businessId = rows[0].id;

  const service = await client.query<{ id: string }>(
    `INSERT INTO services
         (business_id, name, duration_minutes, buffer_before_minutes,
          buffer_after_minutes, price)
     VALUES ($1, 'Root Canal', 60, 10, 15, 8000)
     RETURNING id`,
    [businessId],
  );
  const serviceId = service.rows[0].id;

  const staff: string[] = [];
  for (let i = 0; i < staffCount; i += 1) {
    const s = await client.query<{ id: string }>(
      `INSERT INTO staff_resources (business_id, name) VALUES ($1, $2) RETURNING id`,
      [businessId, `Provider ${i + 1}`],
    );
    staff.push(s.rows[0].id);

    await client.query(
      `INSERT INTO staff_services (business_id, staff_id, service_id) VALUES ($1, $2, $3)`,
      [businessId, s.rows[0].id, serviceId],
    );
    await client.query(
      `INSERT INTO availability_rules
           (business_id, staff_id, day_of_week, start_time, end_time, is_break)
       SELECT $1, $2, d::smallint, TIME '09:00', TIME '18:00', FALSE
       FROM generate_series(0, 6) d`,
      [businessId, s.rows[0].id],
    );
  }

  const day = (
    await client.query<{ d: string }>(
      `SELECT ((NOW() AT TIME ZONE 'Asia/Dhaka')::date + 7)::text AS d`,
    )
  ).rows[0].d;

  return { businessId, serviceId, staff, day };
}

async function destroyWorld(client: Client, world: World): Promise<void> {
  await client.query(`DELETE FROM businesses WHERE id = $1`, [world.businessId]);
}

interface Attempt {
  ok: boolean;
  code?: string;
}

async function attemptBooking(
  client: Client,
  world: World,
  staffId: string | null,
  startIso: string,
  phone: string,
): Promise<Attempt> {
  try {
    await client.query(
      `SELECT * FROM create_booking_atomic($1, $2, $3, $4::timestamptz, $5, $6, NULL, NULL, NULL, 'online')`,
      [world.businessId, world.serviceId, staffId, startIso, "Racer", phone],
    );
    return { ok: true };
  } catch (error) {
    const e = error as { message?: string; code?: string };
    // BK001 carries the canonical ErrorCode as its message; anything else is a
    // genuine failure and is reported as the code so the caller can see it.
    return { ok: false, code: e.code === "BK001" ? e.message : `pg:${e.code}` };
  }
}

/** A dedicated connection per racer: concurrency, not interleaving. */
async function race<T>(n: number, fn: (client: Client, i: number) => Promise<T>): Promise<T[]> {
  const clients = await Promise.all(Array.from({ length: n }, () => connect()));
  try {
    return await Promise.all(clients.map((c, i) => fn(c, i)));
  } finally {
    await Promise.all(clients.map((c) => c.end().catch(() => {})));
  }
}

function slotAt(day: string, hhmm: string): string {
  // The tenant is Asia/Dhaka (+06, no DST), so a fixed offset is exact here
  // and keeps the harness independent of the client's own zone.
  return `${day}T${hhmm}:00+06:00`;
}

type Check = { name: string; run: (admin: Client, world: World) => Promise<string | null> };

const CHECKS: Check[] = [
  {
    name: "50 racers, one slot, one winner",
    run: async (_admin, world) => {
      const at = slotAt(world.day, "10:00");
      const results = await race(50, (c, i) =>
        attemptBooking(c, world, world.staff[0], at, `+88017${String(10000000 + i)}`),
      );

      const winners = results.filter((r) => r.ok).length;
      if (winners !== 1) {
        return `${winners} of 50 racers booked the same slot; exactly one may.`;
      }

      const unexpected = results.filter(
        (r) => !r.ok && r.code !== "SLOT_TAKEN" && r.code !== "SLOT_UNAVAILABLE",
      );
      if (unexpected.length > 0) {
        return `${unexpected.length} loser(s) got something other than a clean refusal, e.g. ${unexpected[0].code}`;
      }
      return null;
    },
  },
  {
    name: "adjacent slots whose buffers overlap (B-03 regression)",
    run: async (_admin, world) => {
      // 10:00-11:00 blocks 09:50-11:15. 11:00-12:00 blocks 10:50-12:15. They
      // overlap, so only one of the two may exist — even though their
      // slot_ranges merely touch. On the spec's schema, which excludes on
      // slot_range, both are accepted and the dentist is double-booked
      // through the sterilisation gap.
      const results = await race(50, (c, i) =>
        attemptBooking(
          c,
          world,
          world.staff[1],
          slotAt(world.day, i % 2 === 0 ? "10:00" : "11:00"),
          `+88018${String(10000000 + i)}`,
        ),
      );

      const winners = results.filter((r) => r.ok).length;
      if (winners !== 1) {
        return `${winners} bookings landed across 10:00 and 11:00; the 15-minute sterilisation buffer allows only one.`;
      }
      return null;
    },
  },
  {
    name: "reschedule races a new booking for the same slot",
    run: async (admin, world) => {
      const staff = world.staff[2];
      const from = slotAt(world.day, "09:00");
      const to = slotAt(world.day, "14:00");

      await admin.query(
        `SELECT * FROM create_booking_atomic($1, $2, $3, $4::timestamptz, 'Mover', '+8801990000001', NULL, NULL, NULL, 'online')`,
        [world.businessId, world.serviceId, staff, from],
      );
      const token = (
        await admin.query<{ reschedule_token: string }>(
          `SELECT reschedule_token FROM bookings
           WHERE business_id = $1 AND staff_id = $2 AND start_time = $3::timestamptz`,
          [world.businessId, staff, from],
        )
      ).rows[0].reschedule_token;

      const [moved, booked] = await race(2, async (c, i) => {
        if (i === 0) {
          try {
            await c.query(`SELECT * FROM reschedule_booking_by_token($1, $2::timestamptz)`, [
              token,
              to,
            ]);
            return { ok: true } as Attempt;
          } catch (error) {
            const e = error as { message?: string; code?: string };
            return { ok: false, code: e.code === "BK001" ? e.message : `pg:${e.code}` };
          }
        }
        return attemptBooking(c, world, staff, to, "+8801990000002");
      });

      if (moved.ok && booked.ok) {
        return "Both the reschedule and the new booking took 14:00.";
      }
      if (!moved.ok && !booked.ok) {
        return `Neither won 14:00, which should have been free: ${moved.code} / ${booked.code}`;
      }
      return null;
    },
  },
  {
    name: "a cancelled slot can be sold again",
    run: async (admin, world) => {
      const staff = world.staff[3];
      const at = slotAt(world.day, "15:00");

      await admin.query(
        `SELECT * FROM create_booking_atomic($1, $2, $3, $4::timestamptz, 'First', '+8801970000001', NULL, NULL, NULL, 'online')`,
        [world.businessId, world.serviceId, staff, at],
      );
      const token = (
        await admin.query<{ reschedule_token: string }>(
          `SELECT reschedule_token FROM bookings
           WHERE business_id = $1 AND staff_id = $2 AND start_time = $3::timestamptz`,
          [world.businessId, staff, at],
        )
      ).rows[0].reschedule_token;

      await admin.query(`SELECT * FROM cancel_booking_by_token($1, 'test')`, [token]);

      const second = await attemptBooking(admin, world, staff, at, "+8801970000002");
      if (!second.ok) {
        return `The freed slot could not be rebooked: ${second.code}`;
      }
      return null;
    },
  },
  {
    name: "property: 400 concurrent attempts leave no overlapping diary",
    run: async (admin, world) => {
      const staff = world.staff;
      const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

      // Deliberately far more attempts than there are slots, all at once, so
      // most of them collide. The assertion is not about how many succeed.
      const tasks = Array.from({ length: 400 }, (_, i) => ({
        staffId: staff[i % staff.length],
        at: slotAt(world.day, hours[(i * 7) % hours.length]),
        phone: `+88016${String(10000000 + i)}`,
      }));

      const POOL = 25;
      const clients = await Promise.all(Array.from({ length: POOL }, () => connect()));
      try {
        let next = 0;
        await Promise.all(
          clients.map(async (c) => {
            for (;;) {
              const i = next;
              next += 1;
              if (i >= tasks.length) return;
              await attemptBooking(c, world, tasks[i].staffId, tasks[i].at, tasks[i].phone);
            }
          }),
        );
      } finally {
        await Promise.all(clients.map((c) => c.end().catch(() => {})));
      }

      const { rows } = await admin.query<{ overlaps: string }>(
        `SELECT count(*)::text AS overlaps
         FROM bookings a
         JOIN bookings b
           ON a.staff_id = b.staff_id
          AND a.id < b.id
          AND a.blocked_range && b.blocked_range
         WHERE a.business_id = $1
           AND a.status IN ('pending','confirmed','checked_in')
           AND b.status IN ('pending','confirmed','checked_in')`,
        [world.businessId],
      );

      if (rows[0].overlaps !== "0") {
        return `${rows[0].overlaps} pair(s) of appointments overlap in a provider's diary.`;
      }
      return null;
    },
  },
];

async function main(): Promise<void> {
  console.log(`Target: ${redactDbUrl(DB_URL)}  (${REPEAT} pass${REPEAT === 1 ? "" : "es"})\n`);

  let failed = 0;

  for (let pass = 1; pass <= REPEAT; pass += 1) {
    if (REPEAT > 1) console.log(`Pass ${pass}/${REPEAT}`);

    const admin = await connect();
    let world: World | null = null;
    try {
      world = await createWorld(admin, 5);

      for (const check of CHECKS) {
        process.stdout.write(`  ${check.name} ... `);
        try {
          const problem = await check.run(admin, world);
          if (problem) {
            failed += 1;
            console.log("FAIL");
            console.error(`    ${problem}`);
          } else {
            console.log("pass");
          }
        } catch (error) {
          failed += 1;
          console.log("ERROR");
          console.error(`    ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      // Always, including after a failure: a leftover tenant would make the
      // next pass race against the previous one's bookings.
      if (world) await destroyWorld(admin, world).catch(() => {});
      await admin.end().catch(() => {});
    }
  }

  const total = CHECKS.length * REPEAT;
  console.log(`\n${total - failed}/${total} concurrency checks passed.`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
