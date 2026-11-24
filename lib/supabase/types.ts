
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "availability_overrides": {
                  Row: {
                    "business_id": string,"created_at": string,"custom_end_time": string | null,"custom_start_time": string | null,"id": string,"is_closed": boolean,"override_date": string,"reason": string | null,"staff_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"custom_end_time"?: string | null,"custom_start_time"?: string | null,"id"?: string,"is_closed"?: boolean,"override_date": string,"reason"?: string | null,"staff_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"custom_end_time"?: string | null,"custom_start_time"?: string | null,"id"?: string,"is_closed"?: boolean,"override_date"?: string,"reason"?: string | null,"staff_id"?: string | null,"updated_at"?: string
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
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"business_members": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"invited_by": string | null,"is_active": boolean,"role": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"invited_by"?: string | null,"is_active"?: boolean,"role": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"invited_by"?: string | null,"is_active"?: boolean,"role"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_members_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
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
                    "address": string | null,"booking_rules": NonNullable<Json>,"branding_config": NonNullable<Json>,"business_code": string,"business_type": string,"created_at": string,"currency": string,"email": string | null,"id": string,"is_active": boolean,"name": string,"onboarding_completed_at": string | null,"onboarding_step": string,"phone": string,"plan_id": string | null,"slug": string,"terminology_config": NonNullable<Json>,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"booking_rules"?: NonNullable<Json>,"branding_config"?: NonNullable<Json>,"business_code"?: string,"business_type": string,"created_at"?: string,"currency"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"onboarding_completed_at"?: string | null,"onboarding_step"?: string,"phone": string,"plan_id"?: string | null,"slug": string,"terminology_config"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"booking_rules"?: NonNullable<Json>,"branding_config"?: NonNullable<Json>,"business_code"?: string,"business_type"?: string,"created_at"?: string,"currency"?: string,"email"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"onboarding_completed_at"?: string | null,"onboarding_step"?: string,"phone"?: string,"plan_id"?: string | null,"slug"?: string,"terminology_config"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string
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
            "public_branches": {
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
      referencedRelation: "public_businesses"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "current_business_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"current_staff_id":
{ Args: { "p_business_id": string }; Returns: string
                           },
"generate_reschedule_token":
{ Args: Record<PropertyKey, never>; Returns: string
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
"register_business":
{ Args: { "p_currency": string,"p_email": string,"p_industry": string,"p_name": string,"p_owner_user_id": string,"p_phone": string,"p_slug"?: string,"p_templates"?: Json,"p_terminology": Json,"p_timezone": string }; Returns: {
              "business_code": string,"business_id": string,"slug": string
            }[]
                           },
"shift_minutes":
{ Args: { "mins": number,"ts": string }; Returns: string
                           },
"slugify":
{ Args: { "p_text": string }; Returns: string
                           },
"timemultirange":
{ Args: Record<PropertyKey, never>; Returns: unknown
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
