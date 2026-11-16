
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_kind": string,"created_at": string,"event_id": string | null,"grant_id": string | null,"id": number,"ip": unknown,"metadata": NonNullable<Json>,"target": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_kind": string,"created_at"?: string,"event_id"?: string | null,"grant_id"?: string | null,"id"?: never,"ip"?: unknown,"metadata"?: NonNullable<Json>,"target"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_kind"?: string,"created_at"?: string,"event_id"?: string | null,"grant_id"?: string | null,"id"?: never,"ip"?: unknown,"metadata"?: NonNullable<Json>,"target"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"event_claims": {
                  Row: {
                    "claimed_at": string | null,"claimed_by": string | null,"created_at": string,"created_by": string,"email_lower": string,"event_id": string,"expires_at": string,"id": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"created_by": string,"email_lower": string,"event_id": string,"expires_at"?: string,"id"?: string,"token_hash": string
                  }
                  Update: {
                    "claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string,"created_by"?: string,"email_lower"?: string,"event_id"?: string,"expires_at"?: string,"id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_claims_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_members": {
                  Row: {
                    "created_at": string,"event_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"role": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_members_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"default_locale": string,"ends_at": string | null,"id": string,"kind": string,"owner_id": string,"passcode_hash": string | null,"plan_id": string | null,"published_content": Json | null,"published_version": number,"settings": NonNullable<Json>,"slug": string,"starts_at": string | null,"status": string,"template_id": string,"template_version": number,"theme": NonNullable<Json>,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"default_locale"?: string,"ends_at"?: string | null,"id"?: string,"kind": string,"owner_id": string,"passcode_hash"?: string | null,"plan_id"?: string | null,"published_content"?: Json | null,"published_version"?: number,"settings"?: NonNullable<Json>,"slug": string,"starts_at"?: string | null,"status"?: string,"template_id": string,"template_version": number,"theme"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"default_locale"?: string,"ends_at"?: string | null,"id"?: string,"kind"?: string,"owner_id"?: string,"passcode_hash"?: string | null,"plan_id"?: string | null,"published_content"?: Json | null,"published_version"?: number,"settings"?: NonNullable<Json>,"slug"?: string,"starts_at"?: string | null,"status"?: string,"template_id"?: string,"template_version"?: number,"theme"?: NonNullable<Json>,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"game_answers": {
                  Row: {
                    "answered_at": string,"event_id": string,"game_id": string,"id": string,"payload": NonNullable<Json>,"player_id": string,"question_id": string,"score": number,"served_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_at"?: string,"event_id": string,"game_id": string,"id"?: string,"payload": NonNullable<Json>,"player_id": string,"question_id": string,"score"?: number,"served_at"?: string | null
                  }
                  Update: {
                    "answered_at"?: string,"event_id"?: string,"game_id"?: string,"id"?: string,"payload"?: NonNullable<Json>,"player_id"?: string,"question_id"?: string,"score"?: number,"served_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_answers_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "game_answers_event_id_game_id_fkey"
      columns: ["event_id","game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["event_id","id"]
    },{
      foreignKeyName: "game_answers_event_id_player_id_fkey"
      columns: ["event_id","player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["event_id","id"]
    }
                  ]
                },"game_secrets": {
                  Row: {
                    "game_id": string,"truth": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "game_id": string,"truth": NonNullable<Json>
                  }
                  Update: {
                    "game_id"?: string,"truth"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_secrets_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"game_serves": {
                  Row: {
                    "event_id": string,"game_id": string,"player_id": string,"question_id": string,"served_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"game_id": string,"player_id": string,"question_id": string,"served_at"?: string
                  }
                  Update: {
                    "event_id"?: string,"game_id"?: string,"player_id"?: string,"question_id"?: string,"served_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_serves_event_id_game_id_fkey"
      columns: ["event_id","game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["event_id","id"]
    },{
      foreignKeyName: "game_serves_event_id_player_id_fkey"
      columns: ["event_id","player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["event_id","id"]
    }
                  ]
                },"games": {
                  Row: {
                    "closes_at": string | null,"config": NonNullable<Json>,"created_at": string,"event_id": string,"id": string,"kind": string,"opens_at": string | null,"position": number,"state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closes_at"?: string | null,"config": NonNullable<Json>,"created_at"?: string,"event_id": string,"id"?: string,"kind": string,"opens_at"?: string | null,"position"?: number,"state"?: string
                  }
                  Update: {
                    "closes_at"?: string | null,"config"?: NonNullable<Json>,"created_at"?: string,"event_id"?: string,"id"?: string,"kind"?: string,"opens_at"?: string | null,"position"?: number,"state"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"guest_sessions": {
                  Row: {
                    "created_at": string,"event_id": string,"expires_at": string,"id": string,"invitation_id": string,"last_seen_at": string,"player_id": string | null,"revoked_at": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"expires_at": string,"id"?: string,"invitation_id": string,"last_seen_at"?: string,"player_id"?: string | null,"revoked_at"?: string | null,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"expires_at"?: string,"id"?: string,"invitation_id"?: string,"last_seen_at"?: string,"player_id"?: string | null,"revoked_at"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guest_sessions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "guest_sessions_event_id_invitation_id_fkey"
      columns: ["event_id","invitation_id"]
isOneToOne: false
      referencedRelation: "invitations"
      referencedColumns: ["event_id","id"]
    },{
      foreignKeyName: "guest_sessions_event_id_player_id_fkey"
      columns: ["event_id","player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["event_id","id"]
    }
                  ]
                },"holding_accounts": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invitations": {
                  Row: {
                    "code_hash": string,"created_at": string,"event_id": string,"id": string,"kind": string,"label": string,"locale": string | null,"max_players": number,"opened_at": string | null,"pax_cap": number,"phone": string | null,"revoked_at": string | null,"side_team_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"created_at"?: string,"event_id": string,"id"?: string,"kind": string,"label": string,"locale"?: string | null,"max_players"?: number,"opened_at"?: string | null,"pax_cap"?: number,"phone"?: string | null,"revoked_at"?: string | null,"side_team_id"?: string | null
                  }
                  Update: {
                    "code_hash"?: string,"created_at"?: string,"event_id"?: string,"id"?: string,"kind"?: string,"label"?: string,"locale"?: string | null,"max_players"?: number,"opened_at"?: string | null,"pax_cap"?: number,"phone"?: string | null,"revoked_at"?: string | null,"side_team_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_event_id_side_team_id_fkey"
      columns: ["event_id","side_team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["event_id","id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "attempts": number,"created_at": string,"id": string,"kind": string,"last_error": string | null,"locked_until": string | null,"payload": NonNullable<Json>,"ref": string,"run_at": string,"state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"kind": string,"last_error"?: string | null,"locked_until"?: string | null,"payload"?: NonNullable<Json>,"ref": string,"run_at"?: string,"state"?: string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"last_error"?: string | null,"locked_until"?: string | null,"payload"?: NonNullable<Json>,"ref"?: string,"run_at"?: string,"state"?: string
                  }
                  Relationships: [
                    
                  ]
                },"live_state": {
                  Row: {
                    "event_id": string,"phase": string,"public_payload": NonNullable<Json>,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"phase"?: string,"public_payload"?: NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "event_id"?: string,"phase"?: string,"public_payload"?: NonNullable<Json>,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "live_state_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"media": {
                  Row: {
                    "bytes": number | null,"clean_path": string | null,"created_at": string,"duration_ms": number | null,"event_id": string,"height": number | null,"id": string,"mime": string | null,"player_id": string | null,"purpose": string,"quarantine_path": string,"state": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes"?: number | null,"clean_path"?: string | null,"created_at"?: string,"duration_ms"?: number | null,"event_id": string,"height"?: number | null,"id"?: string,"mime"?: string | null,"player_id"?: string | null,"purpose": string,"quarantine_path": string,"state"?: string,"width"?: number | null
                  }
                  Update: {
                    "bytes"?: number | null,"clean_path"?: string | null,"created_at"?: string,"duration_ms"?: number | null,"event_id"?: string,"height"?: number | null,"id"?: string,"mime"?: string | null,"player_id"?: string | null,"purpose"?: string,"quarantine_path"?: string,"state"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "media_event_id_player_id_fkey"
      columns: ["event_id","player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["event_id","id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "amount_egp": number,"created_at": string,"event_id": string,"id": string,"paid_at": string | null,"plan_id": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_egp": number,"created_at"?: string,"event_id": string,"id"?: string,"paid_at"?: string | null,"plan_id": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "amount_egp"?: number,"created_at"?: string,"event_id"?: string,"id"?: string,"paid_at"?: string | null,"plan_id"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_egp": number,"approved_by": string | null,"created_at": string,"id": string,"order_id": string,"provider": string,"provider_ref": string,"receipt_media_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_egp": number,"approved_by"?: string | null,"created_at"?: string,"id"?: string,"order_id": string,"provider": string,"provider_ref": string,"receipt_media_id"?: string | null
                  }
                  Update: {
                    "amount_egp"?: number,"approved_by"?: string | null,"created_at"?: string,"id"?: string,"order_id"?: string,"provider"?: string,"provider_ref"?: string,"receipt_media_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_receipt_media_id_fkey"
      columns: ["receipt_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "active": boolean,"entitlements": NonNullable<Json>,"id": string,"name_ar": string,"name_en": string,"position": number,"price_egp": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"entitlements": NonNullable<Json>,"id": string,"name_ar": string,"name_en": string,"position"?: number,"price_egp": number
                  }
                  Update: {
                    "active"?: boolean,"entitlements"?: NonNullable<Json>,"id"?: string,"name_ar"?: string,"name_en"?: string,"position"?: number,"price_egp"?: number
                  }
                  Relationships: [
                    
                  ]
                },"player_secrets": {
                  Row: {
                    "failed_attempts": number,"locked_until": string | null,"player_id": string,"rejoin_hmac": string
                  }
                  ComputedFields: never
                  Insert: {
                    "failed_attempts"?: number,"locked_until"?: string | null,"player_id": string,"rejoin_hmac": string
                  }
                  Update: {
                    "failed_attempts"?: number,"locked_until"?: string | null,"player_id"?: string,"rejoin_hmac"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_secrets_player_id_fkey"
      columns: ["player_id"]
isOneToOne: true
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "approved": boolean,"created_at": string,"event_id": string,"id": string,"invitation_id": string,"name": string,"removed_at": string | null,"team_id": string | null,"team_switched_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved"?: boolean,"created_at"?: string,"event_id": string,"id"?: string,"invitation_id": string,"name": string,"removed_at"?: string | null,"team_id"?: string | null,"team_switched_at"?: string | null
                  }
                  Update: {
                    "approved"?: boolean,"created_at"?: string,"event_id"?: string,"id"?: string,"invitation_id"?: string,"name"?: string,"removed_at"?: string | null,"team_id"?: string | null,"team_switched_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "players_event_id_invitation_id_fkey"
      columns: ["event_id","invitation_id"]
isOneToOne: false
      referencedRelation: "invitations"
      referencedColumns: ["event_id","id"]
    },{
      foreignKeyName: "players_event_id_team_id_fkey"
      columns: ["event_id","team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["event_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"locale": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id": string,"locale"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"locale"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reveals": {
                  Row: {
                    "ciphertext": string | null,"created_at": string,"event_id": string,"id": string,"keeper_code_hash": string | null,"keeper_device_hash": string | null,"key_version": number | null,"nonce": string | null,"reveal_at": string | null,"revealed_at": string | null,"seal_count": number,"sealed_at": string | null,"style": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ciphertext"?: string | null,"created_at"?: string,"event_id": string,"id"?: string,"keeper_code_hash"?: string | null,"keeper_device_hash"?: string | null,"key_version"?: number | null,"nonce"?: string | null,"reveal_at"?: string | null,"revealed_at"?: string | null,"seal_count"?: number,"sealed_at"?: string | null,"style"?: string
                  }
                  Update: {
                    "ciphertext"?: string | null,"created_at"?: string,"event_id"?: string,"id"?: string,"keeper_code_hash"?: string | null,"keeper_device_hash"?: string | null,"key_version"?: number | null,"nonce"?: string | null,"reveal_at"?: string | null,"revealed_at"?: string | null,"seal_count"?: number,"sealed_at"?: string | null,"style"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reveals_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"rsvps": {
                  Row: {
                    "adults": number,"answers": NonNullable<Json>,"children": number,"created_at": string,"event_id": string,"id": string,"invitation_id": string,"player_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adults"?: number,"answers"?: NonNullable<Json>,"children"?: number,"created_at"?: string,"event_id": string,"id"?: string,"invitation_id": string,"player_id"?: string | null,"status": string,"updated_at"?: string
                  }
                  Update: {
                    "adults"?: number,"answers"?: NonNullable<Json>,"children"?: number,"created_at"?: string,"event_id"?: string,"id"?: string,"invitation_id"?: string,"player_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rsvps_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rsvps_event_id_invitation_id_fkey"
      columns: ["event_id","invitation_id"]
isOneToOne: false
      referencedRelation: "invitations"
      referencedColumns: ["event_id","id"]
    },{
      foreignKeyName: "rsvps_event_id_player_id_fkey"
      columns: ["event_id","player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["event_id","id"]
    }
                  ]
                },"score_events": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"player_id": string,"points": number,"reason": string,"ref": string,"team_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"player_id": string,"points": number,"reason": string,"ref": string,"team_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"player_id"?: string,"points"?: number,"reason"?: string,"ref"?: string,"team_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "score_events_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "score_events_event_id_player_id_fkey"
      columns: ["event_id","player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["event_id","id"]
    },{
      foreignKeyName: "score_events_event_id_team_id_fkey"
      columns: ["event_id","team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["event_id","id"]
    }
                  ]
                },"slug_tombstones": {
                  Row: {
                    "retired_at": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "retired_at"?: string,"slug": string
                  }
                  Update: {
                    "retired_at"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff_grants": {
                  Row: {
                    "capabilities": (string)[],"created_at": string,"created_by": string,"event_id": string,"expires_at": string,"id": string,"revoked_at": string | null,"staff_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capabilities": (string)[],"created_at"?: string,"created_by": string,"event_id": string,"expires_at": string,"id"?: string,"revoked_at"?: string | null,"staff_id": string
                  }
                  Update: {
                    "capabilities"?: (string)[],"created_at"?: string,"created_by"?: string,"event_id"?: string,"expires_at"?: string,"id"?: string,"revoked_at"?: string | null,"staff_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_grants_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_roles": {
                  Row: {
                    "created_at": string,"created_by": string | null,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"role": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"team_scores": {
                  Row: {
                    "active_players": number,"event_id": string,"score": number,"team_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_players"?: number,"event_id": string,"score"?: number,"team_id": string,"updated_at"?: string
                  }
                  Update: {
                    "active_players"?: number,"event_id"?: string,"score"?: number,"team_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_scores_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_scores_team_id_fkey"
      columns: ["team_id"]
isOneToOne: true
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "color": string,"event_id": string,"id": string,"key": string,"name_ar": string,"name_en": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "color": string,"event_id": string,"id"?: string,"key": string,"name_ar": string,"name_en": string,"position"?: number
                  }
                  Update: {
                    "color"?: string,"event_id"?: string,"id"?: string,"key"?: string,"name_ar"?: string,"name_en"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"wall_posts": {
                  Row: {
                    "body": string | null,"created_at": string,"event_id": string,"highlighted": boolean,"id": string,"kind": string,"media_id": string | null,"player_id": string,"removed_by_staff_at": string | null,"reported_count": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"event_id": string,"highlighted"?: boolean,"id"?: string,"kind": string,"media_id"?: string | null,"player_id": string,"removed_by_staff_at"?: string | null,"reported_count"?: number,"status"?: string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"event_id"?: string,"highlighted"?: boolean,"id"?: string,"kind"?: string,"media_id"?: string | null,"player_id"?: string,"removed_by_staff_at"?: string | null,"reported_count"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wall_posts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wall_posts_event_id_media_id_fkey"
      columns: ["event_id","media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["event_id","id"]
    },{
      foreignKeyName: "wall_posts_event_id_player_id_fkey"
      columns: ["event_id","player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["event_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_event":
{ Args: { "p_email_lower": string,"p_token_hash": string,"p_user_id": string }; Returns: {
              "claim_id": string,"event_id": string,"previous_owner": string
            }[]
                           },
"db_now":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"invitations_add":
{ Args: { "p_event_id": string,"p_max_guests": number,"p_rows": Json }; Returns: Json
                           },
"jobs_claim":
{ Args: { "p_limit": number,"p_visibility_seconds": number }; Returns: {
              "attempts": number,
"created_at": string,
"id": string,
"kind": string,
"last_error": string | null,
"locked_until": string | null,
"payload": NonNullable<Json>,
"ref": string,
"run_at": string,
"state": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"join_player":
{ Args: { "p_approved": boolean,"p_event_id": string,"p_invitation_id": string,"p_name": string,"p_team_id": string }; Returns: {
              "approved": boolean,"id": string,"name": string,"team_id": string,"team_switched_at": string
            }[]
                           },
"media_complete":
{ Args: { "p_event_cap": number,"p_event_id": string,"p_media_id": string,"p_photo_cap": number,"p_player_id": string,"p_voice_cap": number }; Returns: string
                           },
"media_reserve":
{ Args: { "p_event_cap": number,"p_event_id": string,"p_id": string,"p_path": string,"p_pending_cap": number,"p_player_cap": number,"p_player_id": string,"p_purpose": string }; Returns: string
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"rate_limit_refund":
{ Args: { "p_key": string,"p_window_seconds": number }; Returns: undefined
                           },
"recap_top_players":
{ Args: { "p_event_id": string,"p_per_team": number }; Returns: {
              "name": string,"player_id": string,"points": number,"team_id": string
            }[]
                           },
"recompute_team_scores":
{ Args: { "p_event_id": string }; Returns: undefined
                           },
"rejoin_reserve":
{ Args: { "p_lock_seconds": number,"p_max": number,"p_player_id": string }; Returns: string
                           },
"rejoin_success":
{ Args: { "p_player_id": string }; Returns: undefined
                           },
"reveal_cancel":
{ Args: { "p_event_id": string }; Returns: boolean
                           },
"reveal_release":
{ Args: { "p_event_id": string }; Returns: {
              "ciphertext": string,"id": string,"key_version": number,"nonce": string
            }[]
                           },
"reveal_seal":
{ Args: { "p_ciphertext": string,"p_device_hash": string,"p_key_version": number,"p_nonce": string,"p_reveal_id": string }; Returns: {
              "out_seal_count": number,"out_state": string
            }[]
                           },
"reveal_start":
{ Args: { "p_event_id": string,"p_lead_seconds": number }; Returns: string
                           },
"server_now":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"settle_order":
{ Args: { "p_amount_egp": number,"p_approved_by": string,"p_order_id": string,"p_provider": string,"p_provider_ref": string,"p_receipt_media_id": string }; Returns: boolean
                           },
"staff_find_events":
{ Args: { "p_limit": number,"p_query": string }; Returns: {
              "created_at": string,"id": string,"kind": string,"owner_email": string,"owner_id": string,"plan_id": string,"slug": string,"status": string
            }[]
                           },
"staff_user_emails":
{ Args: { "p_ids": (string)[] }; Returns: {
              "email": string,"id": string
            }[]
                           },
"staff_user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"unsettle_order":
{ Args: { "p_order_id": string,"p_status": string }; Returns: {
              "event_id": string,"plan_id": string,"slug": string
            }[]
                           },
"wall_report":
{ Args: { "p_event_id": string,"p_player_id": string,"p_post_id": string,"p_threshold": number }; Returns: boolean
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
