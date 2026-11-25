export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "availability_overrides": {
                  Row: {
                    "business_id": string,"created_at": string,"custom_end_time": string | null,"custom_start_time": string | null,"decided_at": string | null,"decided_by": string | null,"id": string,"is_closed": boolean,"override_date": string,"reason": string | null,"requested_by": string | null,"staff_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"custom_end_time"?: string | null,"custom_start_time"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"is_closed"?: boolean,"override_date": string,"reason"?: string | null,"requested_by"?: string | null,"staff_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"custom_end_time"?: string | null,"custom_start_time"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"is_closed"?: boolean,"override_date"?: string,"reason"?: string | null,"requested_by"?: string | null,"staff_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_overrides_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "availability_overrides_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "availability_overrides_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "availability_overrides_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "availability_overrides_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff_resources"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"availability_rules": {
                  Row: {
                    "business_id": string,"created_at": string,"day_of_week": number,"end_time": string,"id": string,"is_break": boolean,"staff_id": string,"start_time": string,"updated_at": string,"work_range": unknown
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"day_of_week": number,"end_time": string,"id"?: string,"is_break"?: boolean,"staff_id": string,"start_time": string,"updated_at"?: string,"work_range"?: never
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"day_of_week"?: number,"end_time"?: string,"id"?: string,"is_break"?: boolean,"staff_id"?: string,"start_time"?: string,"updated_at"?: string,"work_range"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_rules_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "availability_rules_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "availability_rules_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "availability_rules_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "availability_rules_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff_resources"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"booking_code_counters": {
                  Row: {
                    "business_id": string,"code_date": string,"last_value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"code_date": string,"last_value"?: number
                  }
                  Update: {
                    "business_id"?: string,"code_date"?: string,"last_value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_code_counters_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_code_counters_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "booking_code_counters_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_history": {
                  Row: {
                    "action": string,"actor_type": string,"actor_user_id": string | null,"booking_id": string,"business_id": string,"created_at": string,"id": string,"new_start_time": string | null,"new_status": string | null,"old_start_time": string | null,"old_status": string | null,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_type": string,"actor_user_id"?: string | null,"booking_id": string,"business_id": string,"created_at"?: string,"id"?: string,"new_start_time"?: string | null,"new_status"?: string | null,"old_start_time"?: string | null,"old_status"?: string | null,"reason"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_type"?: string,"actor_user_id"?: string | null,"booking_id"?: string,"business_id"?: string,"created_at"?: string,"id"?: string,"new_start_time"?: string | null,"new_status"?: string | null,"old_start_time"?: string | null,"old_status"?: string | null,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_history_booking_same_business"
      columns: ["business_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "booking_history_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_history_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "booking_history_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "blocked_range": unknown,"booking_code": string,"booking_source": string,"branch_id": string | null,"buffer_after_minutes": number,"buffer_before_minutes": number,"business_id": string,"created_at": string,"customer_id": string,"customer_notes": string | null,"end_time": string,"id": string,"internal_notes": string | null,"paid_amount": number,"payment_status": string,"reschedule_count": number,"reschedule_token": string,"service_id": string,"slot_range": unknown,"staff_id": string,"start_time": string,"status": string,"total_price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_range"?: never,"booking_code": string,"booking_source"?: string,"branch_id"?: string | null,"buffer_after_minutes"?: number,"buffer_before_minutes"?: number,"business_id": string,"created_at"?: string,"customer_id": string,"customer_notes"?: string | null,"end_time": string,"id"?: string,"internal_notes"?: string | null,"paid_amount"?: number,"payment_status"?: string,"reschedule_count"?: number,"reschedule_token"?: string,"service_id": string,"slot_range"?: never,"staff_id": string,"start_time": string,"status"?: string,"total_price"?: number,"updated_at"?: string
                  }
                  Update: {
                    "blocked_range"?: never,"booking_code"?: string,"booking_source"?: string,"branch_id"?: string | null,"buffer_after_minutes"?: number,"buffer_before_minutes"?: number,"business_id"?: string,"created_at"?: string,"customer_id"?: string,"customer_notes"?: string | null,"end_time"?: string,"id"?: string,"internal_notes"?: string | null,"paid_amount"?: number,"payment_status"?: string,"reschedule_count"?: number,"reschedule_token"?: string,"service_id"?: string,"slot_range"?: never,"staff_id"?: string,"start_time"?: string,"status"?: string,"total_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_branch_same_business"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_branch_same_business"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "public_branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "bookings_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_customer_same_business"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_service_same_business"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "public_services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_service_same_business"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "bookings_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff_resources"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "address": string | null,"business_id": string,"created_at": string,"id": string,"is_active": boolean,"is_default": boolean,"map_url": string | null,"name": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"business_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_default"?: boolean,"map_url"?: string | null,"name": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"business_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_default"?: boolean,"map_url"?: string | null,"name"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branches_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branches_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "branches_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"business_members": {
                  Row: {
                    "branch_id": string | null,"business_id": string,"created_at": string,"id": string,"invited_by": string | null,"is_active": boolean,"role": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string | null,"business_id": string,"created_at"?: string,"id"?: string,"invited_by"?: string | null,"is_active"?: boolean,"role": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "branch_id"?: string | null,"business_id"?: string,"created_at"?: string,"id"?: string,"invited_by"?: string | null,"is_active"?: boolean,"role"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_members_branch_same_business"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "business_members_branch_same_business"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "public_branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "business_members_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "business_members_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "business_members_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "address": string | null,"booking_rules": NonNullable<Json>,"branding_config": NonNullable<Json>,"business_code": string,"business_type": string,"created_at": string,"currency": string,"email": string | null,"id": string,"is_active": boolean,"name": string,"onboarding_completed_at": string | null,"onboarding_step": string,"phone": string,"plan_expires_at": string | null,"plan_id": string | null,"slug": string,"terminology_config": NonNullable<Json>,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"booking_rules"?: NonNullable<Json>,"branding_config"?: NonNullable<Json>,"business_code"?: string,"business_type": string,"created_at"?: string,"currency"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"onboarding_completed_at"?: string | null,"onboarding_step"?: string,"phone": string,"plan_expires_at"?: string | null,"plan_id"?: string | null,"slug": string,"terminology_config"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"booking_rules"?: NonNullable<Json>,"branding_config"?: NonNullable<Json>,"business_code"?: string,"business_type"?: string,"created_at"?: string,"currency"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"onboarding_completed_at"?: string | null,"onboarding_step"?: string,"phone"?: string,"plan_expires_at"?: string | null,"plan_id"?: string | null,"slug"?: string,"terminology_config"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "businesses_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "business_id": string,"created_at": string,"email": string | null,"full_name": string,"id": string,"no_show_count": number,"notes": string | null,"phone": string,"preferred_channel": string,"total_bookings": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"email"?: string | null,"full_name": string,"id"?: string,"no_show_count"?: number,"notes"?: string | null,"phone": string,"preferred_channel"?: string,"total_bookings"?: number,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"email"?: string | null,"full_name"?: string,"id"?: string,"no_show_count"?: number,"notes"?: string | null,"phone"?: string,"preferred_channel"?: string,"total_bookings"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "customers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_daily_stats": {
                  Row: {
                    "business_id": string,"channel": string,"count": number,"day": string,"event_type": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"channel": string,"count"?: number,"day": string,"event_type": string,"status": string
                  }
                  Update: {
                    "business_id"?: string,"channel"?: string,"count"?: number,"day"?: string,"event_type"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_daily_stats_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_daily_stats_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "notification_daily_stats_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_logs": {
                  Row: {
                    "attempts": number,"booking_id": string | null,"business_id": string,"channel": string,"created_at": string,"event_type": string,"id": string,"last_error": string | null,"locked_at": string | null,"max_attempts": number,"message_body": string,"provider": string | null,"provider_message_id": string | null,"recipient_contact": string,"recipient_type": string,"scheduled_at": string,"sent_at": string | null,"status": string,"subject": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"booking_id"?: string | null,"business_id": string,"channel": string,"created_at"?: string,"event_type": string,"id"?: string,"last_error"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"message_body": string,"provider"?: string | null,"provider_message_id"?: string | null,"recipient_contact": string,"recipient_type": string,"scheduled_at": string,"sent_at"?: string | null,"status"?: string,"subject"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"booking_id"?: string | null,"business_id"?: string,"channel"?: string,"created_at"?: string,"event_type"?: string,"id"?: string,"last_error"?: string | null,"locked_at"?: string | null,"max_attempts"?: number,"message_body"?: string,"provider"?: string | null,"provider_message_id"?: string | null,"recipient_contact"?: string,"recipient_type"?: string,"scheduled_at"?: string,"sent_at"?: string | null,"status"?: string,"subject"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_logs_booking_same_business"
      columns: ["business_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "notification_logs_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_logs_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "notification_logs_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_templates": {
                  Row: {
                    "body_template": string,"business_id": string,"channel": string,"created_at": string,"event_type": string,"id": string,"is_enabled": boolean,"subject": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body_template": string,"business_id": string,"channel": string,"created_at"?: string,"event_type": string,"id"?: string,"is_enabled"?: boolean,"subject"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "body_template"?: string,"business_id"?: string,"channel"?: string,"created_at"?: string,"event_type"?: string,"id"?: string,"is_enabled"?: boolean,"subject"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_templates_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_templates_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "notification_templates_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_claimed": number,"amount_expected": number,"amount_verified": number | null,"booking_id": string | null,"business_id": string,"created_at": string,"currency": string,"customer_id": string | null,"id": string,"method": string,"payer_phone": string | null,"provider_txn_id": string | null,"purpose": string,"rejection_reason": string | null,"status": string,"updated_at": string,"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_claimed": number,"amount_expected": number,"amount_verified"?: number | null,"booking_id"?: string | null,"business_id": string,"created_at"?: string,"currency"?: string,"customer_id"?: string | null,"id"?: string,"method": string,"payer_phone"?: string | null,"provider_txn_id"?: string | null,"purpose"?: string,"rejection_reason"?: string | null,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "amount_claimed"?: number,"amount_expected"?: number,"amount_verified"?: number | null,"booking_id"?: string | null,"business_id"?: string,"created_at"?: string,"currency"?: string,"customer_id"?: string | null,"id"?: string,"method"?: string,"payer_phone"?: string | null,"provider_txn_id"?: string | null,"purpose"?: string,"rejection_reason"?: string | null,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_same_business"
      columns: ["business_id","booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "payments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "payments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_customer_same_business"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"note": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"note"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"note"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_audit": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"created_at": string,"detail": string | null,"id": string,"target_business_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"created_at"?: string,"detail"?: string | null,"id"?: string,"target_business_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"created_at"?: string,"detail"?: string | null,"id"?: string,"target_business_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_audit_target_business_id_fkey"
      columns: ["target_business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_audit_target_business_id_fkey"
      columns: ["target_business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "platform_audit_target_business_id_fkey"
      columns: ["target_business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_email_usage": {
                  Row: {
                    "month": string,"sent": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "month": string,"sent"?: number,"updated_at"?: string
                  }
                  Update: {
                    "month"?: string,"sent"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_heartbeat": {
                  Row: {
                    "id": number,"last_seen_at": string,"note": string | null,"source": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: number,"last_seen_at"?: string,"note"?: string | null,"source"?: string | null
                  }
                  Update: {
                    "id"?: number,"last_seen_at"?: string,"note"?: string | null,"source"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"business_id": string,"created_at": string,"customer_id": string | null,"endpoint": string,"id": string,"last_used_at": string | null,"p256dh": string,"user_agent": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"business_id": string,"created_at"?: string,"customer_id"?: string | null,"endpoint": string,"id"?: string,"last_used_at"?: string | null,"p256dh": string,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "auth"?: string,"business_id"?: string,"created_at"?: string,"customer_id"?: string | null,"endpoint"?: string,"id"?: string,"last_used_at"?: string | null,"p256dh"?: string,"user_agent"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_subscriptions_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "push_subscriptions_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_subscriptions_customer_same_business"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"rate_limit_hits": {
                  Row: {
                    "bucket": string,"hits": number,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"hits"?: number,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"hits"?: number,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"services": {
                  Row: {
                    "buffer_after_minutes": number,"buffer_before_minutes": number,"business_id": string,"category": string | null,"color_hex": string,"created_at": string,"deposit_required": number,"description": string | null,"duration_minutes": number,"id": string,"is_active": boolean,"name": string,"price": number,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buffer_after_minutes"?: number,"buffer_before_minutes"?: number,"business_id": string,"category"?: string | null,"color_hex"?: string,"created_at"?: string,"deposit_required"?: number,"description"?: string | null,"duration_minutes": number,"id"?: string,"is_active"?: boolean,"name": string,"price"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "buffer_after_minutes"?: number,"buffer_before_minutes"?: number,"business_id"?: string,"category"?: string | null,"color_hex"?: string,"created_at"?: string,"deposit_required"?: number,"description"?: string | null,"duration_minutes"?: number,"id"?: string,"is_active"?: boolean,"name"?: string,"price"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_resources": {
                  Row: {
                    "avatar_url": string | null,"branch_id": string | null,"business_id": string,"created_at": string,"email": string | null,"id": string,"is_active": boolean,"name": string,"phone": string | null,"sort_order": number,"title": string | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"branch_id"?: string | null,"business_id": string,"created_at"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"phone"?: string | null,"sort_order"?: number,"title"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"branch_id"?: string | null,"business_id"?: string,"created_at"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"phone"?: string | null,"sort_order"?: number,"title"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_resources_branch_same_business"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "staff_resources_branch_same_business"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "public_branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "staff_resources_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_resources_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "staff_resources_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_services": {
                  Row: {
                    "business_id": string,"created_at": string,"custom_duration_minutes": number | null,"custom_price": number | null,"service_id": string,"staff_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"custom_duration_minutes"?: number | null,"custom_price"?: number | null,"service_id": string,"staff_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"custom_duration_minutes"?: number | null,"custom_price"?: number | null,"service_id"?: string,"staff_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "staff_services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_services_service_same_business"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "public_services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "staff_services_service_same_business"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "staff_services_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "staff_services_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff_resources"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"subscription_invoices": {
                  Row: {
                    "amount_due": number,"amount_paid": number,"business_id": string,"created_at": string,"currency": string,"due_date": string | null,"id": string,"invoice_number": string,"method": string | null,"period_end": string,"period_start": string,"plan_id": string,"provider_txn_id": string | null,"status": string,"updated_at": string,"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_due": number,"amount_paid"?: number,"business_id": string,"created_at"?: string,"currency"?: string,"due_date"?: string | null,"id"?: string,"invoice_number": string,"method"?: string | null,"period_end": string,"period_start": string,"plan_id": string,"provider_txn_id"?: string | null,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "amount_due"?: number,"amount_paid"?: number,"business_id"?: string,"created_at"?: string,"currency"?: string,"due_date"?: string | null,"id"?: string,"invoice_number"?: string,"method"?: string | null,"period_end"?: string,"period_start"?: string,"plan_id"?: string,"provider_txn_id"?: string | null,"status"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_invoices_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_invoices_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "subscription_invoices_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_invoices_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "subscription_plans"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_plans": {
                  Row: {
                    "code": string,"created_at": string,"currency": string,"features": NonNullable<Json>,"id": string,"is_active": boolean,"max_branches": number,"max_monthly_bookings": number,"max_staff": number,"monthly_email_quota": number,"monthly_price": number,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"currency"?: string,"features"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"max_branches"?: number,"max_monthly_bookings"?: number,"max_staff"?: number,"monthly_email_quota"?: number,"monthly_price"?: number,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"currency"?: string,"features"?: NonNullable<Json>,"id"?: string,"is_active"?: boolean,"max_branches"?: number,"max_monthly_bookings"?: number,"max_staff"?: number,"monthly_email_quota"?: number,"monthly_price"?: number,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"waitlist_entries": {
                  Row: {
                    "business_id": string,"created_at": string,"customer_email": string | null,"customer_id": string | null,"customer_name": string,"customer_phone": string,"desired_date": string,"desired_from_time": string | null,"desired_to_time": string | null,"expires_at": string,"id": string,"note": string | null,"notified_at": string | null,"service_id": string,"staff_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"customer_email"?: string | null,"customer_id"?: string | null,"customer_name": string,"customer_phone": string,"desired_date": string,"desired_from_time"?: string | null,"desired_to_time"?: string | null,"expires_at": string,"id"?: string,"note"?: string | null,"notified_at"?: string | null,"service_id": string,"staff_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"customer_email"?: string | null,"customer_id"?: string | null,"customer_name"?: string,"customer_phone"?: string,"desired_date"?: string,"desired_from_time"?: string | null,"desired_to_time"?: string | null,"expires_at"?: string,"id"?: string,"note"?: string | null,"notified_at"?: string | null,"service_id"?: string,"staff_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "waitlist_customer_same_business"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "waitlist_entries_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_entries_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "waitlist_entries_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waitlist_service_same_business"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "public_services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "waitlist_service_same_business"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "waitlist_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "public_staff"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "waitlist_staff_same_business"
      columns: ["business_id","staff_id"]
isOneToOne: false
      referencedRelation: "staff_resources"
      referencedColumns: ["business_id","id"]
    }
                  ]
                }
          }
          Views: {
            "plan_usage": {
                  Row: {
                    "bookings_this_month": number | null,"branches_used": number | null,"business_id": string,"features": NonNullable<Json>,"max_branches": number,"max_monthly_bookings": number,"max_staff": number,"plan_code": string,"plan_expires_at": string | null,"plan_name": string,"staff_used": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"public_branches": {
                  Row: {
                    "address": string | null,"business_id": string,"id": string,"is_default": boolean,"map_url": string | null,"name": string,"phone": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "branches_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branches_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "branches_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"public_businesses": {
                  Row: {
                    "address": string | null,"booking_rules": Json | null,"branding_config": NonNullable<Json>,"business_type": string,"currency": string,"id": string,"name": string,"phone": string,"slug": string,"terminology_config": NonNullable<Json>,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                           "address"?: string | null,"booking_rules"?: never,"branding_config"?: Json | null,"business_type"?: string | null,"currency"?: string | null,"id"?: string | null,"name"?: string | null,"phone"?: string | null,"slug"?: string | null,"terminology_config"?: Json | null,"timezone"?: string | null
                         }
                        Update: {
                           "address"?: string | null,"booking_rules"?: never,"branding_config"?: Json | null,"business_type"?: string | null,"currency"?: string | null,"id"?: string | null,"name"?: string | null,"phone"?: string | null,"slug"?: string | null,"terminology_config"?: Json | null,"timezone"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"public_services": {
                  Row: {
                    "business_id": string,"category": string | null,"color_hex": string,"deposit_required": number,"description": string | null,"duration_minutes": number,"id": string,"name": string,"price": number,"sort_order": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"public_staff": {
                  Row: {
                    "avatar_url": string | null,"branch_id": string | null,"business_id": string,"id": string,"name": string,"sort_order": number,"title": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "staff_resources_branch_same_business"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "staff_resources_branch_same_business"
      columns: ["business_id","branch_id"]
isOneToOne: false
      referencedRelation: "public_branches"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "staff_resources_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_resources_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "plan_usage"
      referencedColumns: ["business_id"]
    },{
      foreignKeyName: "staff_resources_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "admin_reschedule_booking":
{ Args: { "p_booking_id": string,"p_reason"?: string,"p_staff_id"?: string,"p_start_time": string }; Returns: {
              "booking_id": string,"end_time": string,"staff_id": string,"start_time": string
            }[]
                           },
"analytics_peak_hours":
{ Args: { "p_business_id": string,"p_from": string,"p_to": string }; Returns: {
              "bookings": number,"hour_of_day": number
            }[]
                           },
"analytics_summary":
{ Args: { "p_business_id": string,"p_from": string,"p_to": string }; Returns: {
              "cancelled": number,"collected": number,"completed": number,"completion_rate": number,"distinct_customers": number,"estimated": number,"no_show_rate": number,"no_shows": number,"repeat_customers": number,"total_bookings": number
            }[]
                           },
"available_slots_for":
{ Args: { "p_business_id": string,"p_date": string,"p_exclude_booking_id"?: string,"p_ignore_lead"?: boolean,"p_service_id": string,"p_staff_id": string }; Returns: {
              "slot_end": string,"slot_start": string
            }[]
                           },
"booking_error":
{ Args: { "p_code": string,"p_detail": string }; Returns: undefined
                           },
"booking_rule_bool":
{ Args: { "p_default": boolean,"p_key": string,"p_rules": Json }; Returns: boolean
                           },
"booking_rule_int":
{ Args: { "p_default": number,"p_key": string,"p_rules": Json }; Returns: number
                           },
"booking_status_transition_allowed":
{ Args: { "p_from": string,"p_to": string }; Returns: boolean
                           },
"branch_in_scope":
{ Args: { "p_branch_id": string,"p_business_id": string }; Returns: boolean
                           },
"busy_ranges":
{ Args: { "p_business_id": string,"p_exclude_booking_id"?: string,"p_from": string,"p_staff_id": string,"p_to": string }; Returns: unknown
                           },
"cancel_booking_by_token":
{ Args: { "p_reason"?: string,"p_token": string }; Returns: {
              "booking_code": string,"booking_id": string,"status": string
            }[]
                           },
"check_rate_limit":
{ Args: { "p_bucket": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"claim_email_allowance":
{ Args: { "p_limit": number }; Returns: boolean
                           },
"claim_notifications":
{ Args: { "p_limit"?: number }; Returns: {
              "attempts": number,"booking_id": string,"business_id": string,"channel": string,"event_type": string,"id": string,"max_attempts": number,"message_body": string,"recipient_contact": string,"recipient_type": string,"subject": string
            }[]
                           },
"complete_notification":
{ Args: { "p_error"?: string,"p_id": string,"p_ok": boolean,"p_provider"?: string,"p_provider_id"?: string }; Returns: string
                           },
"create_booking_atomic":
{ Args: { "p_branch_id"?: string,"p_business_id": string,"p_customer_email"?: string,"p_customer_name": string,"p_customer_notes"?: string,"p_customer_phone": string,"p_service_id": string,"p_source"?: string,"p_staff_id": string,"p_start_time": string }; Returns: {
              "booking_code": string,"booking_id": string,"end_time": string,"reschedule_token": string,"staff_id": string,"start_time": string,"status": string
            }[]
                           },
"current_business_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"current_staff_id":
{ Args: { "p_business_id": string }; Returns: string
                           },
"expire_subscriptions":
{ Args: { "p_grace_days"?: number }; Returns: number
                           },
"expire_waitlist_offers":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"generate_reschedule_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_available_slots":
{ Args: { "p_business_id": string,"p_date": string,"p_service_id": string,"p_staff_id": string }; Returns: {
              "slot_end": string,"slot_start": string
            }[]
                           },
"get_available_slots_any":
{ Args: { "p_branch_id"?: string,"p_business_id": string,"p_date": string,"p_service_id": string }; Returns: {
              "slot_end": string,"slot_start": string,"staff_id": string
            }[]
                           },
"get_booking_by_token":
{ Args: { "p_token": string }; Returns: {
              "booking_code": string,"booking_id": string,"business_address": string,"business_name": string,"business_phone": string,"business_slug": string,"customer_name": string,"end_time": string,"max_reschedules": number,"min_cancel_hours": number,"min_reschedule_hours": number,"reschedule_count": number,"service_id": string,"service_name": string,"staff_id": string,"staff_name": string,"start_time": string,"status": string,"terminology": Json,"timezone": string
            }[]
                           },
"get_desk_slots":
{ Args: { "p_business_id": string,"p_date": string,"p_service_id": string,"p_staff_id": string }; Returns: {
              "slot_end": string,"slot_start": string
            }[]
                           },
"get_month_availability":
{ Args: { "p_business_id": string,"p_month": number,"p_service_id": string,"p_staff_id"?: string,"p_year": number }; Returns: {
              "day": string,"has_slots": boolean
            }[]
                           },
"has_role":
{ Args: { "p_business_id": string,"p_roles": (string)[] }; Returns: boolean
                           },
"is_business_admin":
{ Args: { "p_business_id": string }; Returns: boolean
                           },
"is_business_member":
{ Args: { "p_business_id": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"join_waitlist":
{ Args: { "p_business_id": string,"p_customer_email"?: string,"p_customer_name": string,"p_customer_phone": string,"p_desired_date": string,"p_note"?: string,"p_service_id": string,"p_staff_id"?: string }; Returns: string
                           },
"member_branch_id":
{ Args: { "p_business_id": string }; Returns: string
                           },
"notify_waitlist_for_booking":
{ Args: { "p_booking_id": string }; Returns: string
                           },
"plan_feature":
{ Args: { "p_business_id": string,"p_key": string }; Returns: boolean
                           },
"plan_limit":
{ Args: { "p_business_id": string,"p_key": string }; Returns: number
                           },
"prune_notification_logs":
{ Args: { "p_days"?: number }; Returns: number
                           },
"queue_booking_notifications":
{ Args: { "p_booking_id": string }; Returns: number
                           },
"reap_stuck_notifications":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"register_business":
{ Args: { "p_currency": string,"p_email": string,"p_industry": string,"p_name": string,"p_owner_user_id": string,"p_phone": string,"p_slug"?: string,"p_templates"?: Json,"p_terminology": Json,"p_timezone": string }; Returns: {
              "business_code": string,"business_id": string,"slug": string
            }[]
                           },
"render_template":
{ Args: { "p_body": string,"p_vars": Json }; Returns: string
                           },
"reschedule_booking_by_token":
{ Args: { "p_start_time": string,"p_token": string }; Returns: {
              "booking_code": string,"booking_id": string,"end_time": string,"reschedule_token": string,"reschedules_left": number,"start_time": string
            }[]
                           },
"resolved_duration_minutes":
{ Args: { "p_service_id": string,"p_staff_id": string }; Returns: number
                           },
"revenue_summary":
{ Args: { "p_business_id": string,"p_from": string,"p_to": string }; Returns: {
              "bookings": number,"collected": number,"outstanding": number
            }[]
                           },
"set_booking_status":
{ Args: { "p_booking_id": string,"p_new_status": string,"p_reason"?: string }; Returns: string
                           },
"set_business_active":
{ Args: { "p_active": boolean,"p_business_id": string,"p_note"?: string }; Returns: boolean
                           },
"shift_minutes":
{ Args: { "mins": number,"ts": string }; Returns: string
                           },
"skip_notification":
{ Args: { "p_id": string,"p_reason": string }; Returns: undefined
                           },
"slugify":
{ Args: { "p_text": string }; Returns: string
                           },
"sweep_unverified_deposits":
{ Args: { "p_hours"?: number }; Returns: number
                           },
"timemultirange":
{ Args: Record<PropertyKey, never>; Returns: unknown
                           },
"working_windows":
{ Args: { "p_business_id": string,"p_date": string,"p_staff_id": string }; Returns: unknown
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
