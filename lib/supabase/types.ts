/**
 * Generated database types.
 *
 * Regenerate with `npm run db:types` after every migration. Phase 0 ships a
 * placeholder so the client wrappers are typed from day one; it is overwritten
 * wholesale once Phase 1 lands the first migration.
 *
 * DO NOT hand-edit.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
