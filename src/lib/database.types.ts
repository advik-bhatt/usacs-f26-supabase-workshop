
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "asteroids": {
                  Row: {
                    "a": number,"ca_date": string,"ca_dist_au": number,"ca_jd": number,"des": string,"diameter_km": number,"diameter_measured": boolean,"e": number,"epoch": number,"fetched_at": string,"h": number,"i": number,"ma": number,"name": string,"om": number,"pha": boolean,"v_inf_kms": number,"w": number
                  }
                  ComputedFields: never
                  Insert: {
                    "a": number,"ca_date": string,"ca_dist_au": number,"ca_jd": number,"des": string,"diameter_km": number,"diameter_measured"?: boolean,"e": number,"epoch": number,"fetched_at"?: string,"h": number,"i": number,"ma": number,"name": string,"om": number,"pha"?: boolean,"v_inf_kms": number,"w": number
                  }
                  Update: {
                    "a"?: number,"ca_date"?: string,"ca_dist_au"?: number,"ca_jd"?: number,"des"?: string,"diameter_km"?: number,"diameter_measured"?: boolean,"e"?: number,"epoch"?: number,"fetched_at"?: string,"h"?: number,"i"?: number,"ma"?: number,"name"?: string,"om"?: number,"pha"?: boolean,"v_inf_kms"?: number,"w"?: number
                  }
                  Relationships: [
                    
                  ]
                },"credits": {
                  Row: {
                    "amount": number,"created_at": string,"crew_id": string,"id": number,"target_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"crew_id": string,"id"?: never,"target_id"?: number | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"crew_id"?: string,"id"?: never,"target_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "credits_crew_id_fkey"
      columns: ["crew_id"]
isOneToOne: false
      referencedRelation: "crew"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "credits_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "targets"
      referencedColumns: ["id"]
    }
                  ]
                },"crew": {
                  Row: {
                    "id": string,"joined_at": string,"kind": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"joined_at"?: string,"kind"?: string,"name": string
                  }
                  Update: {
                    "id"?: string,"joined_at"?: string,"kind"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"deflections": {
                  Row: {
                    "capture_km": number,"crew_id": string,"direction": string,"dv_ms": number,"flown_at": string,"id": number,"lead_days": number,"mass_kg": number,"miss_km": number,"saved": boolean,"score": number,"seconds": number,"target_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "capture_km": number,"crew_id": string,"direction": string,"dv_ms": number,"flown_at"?: string,"id"?: never,"lead_days": number,"mass_kg": number,"miss_km": number,"saved": boolean,"score": number,"seconds": number,"target_id": number
                  }
                  Update: {
                    "capture_km"?: number,"crew_id"?: string,"direction"?: string,"dv_ms"?: number,"flown_at"?: string,"id"?: never,"lead_days"?: number,"mass_kg"?: number,"miss_km"?: number,"saved"?: boolean,"score"?: number,"seconds"?: number,"target_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "deflections_crew_id_fkey"
      columns: ["crew_id"]
isOneToOne: false
      referencedRelation: "crew"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deflections_target_id_fkey"
      columns: ["target_id"]
isOneToOne: true
      referencedRelation: "targets"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "at": string,"crew_id": string | null,"detail": NonNullable<Json>,"id": number,"kind": string,"target_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"crew_id"?: string | null,"detail"?: NonNullable<Json>,"id"?: never,"kind": string,"target_id"?: number | null
                  }
                  Update: {
                    "at"?: string,"crew_id"?: string | null,"detail"?: NonNullable<Json>,"id"?: never,"kind"?: string,"target_id"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"mission": {
                  Row: {
                    "id": boolean,"open": boolean,"targets_per_tick": number,"updated_at": string,"window_seconds": number,"work_seconds": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"open"?: boolean,"targets_per_tick"?: number,"updated_at"?: string,"window_seconds"?: number,"work_seconds"?: number
                  }
                  Update: {
                    "id"?: boolean,"open"?: boolean,"targets_per_tick"?: number,"updated_at"?: string,"window_seconds"?: number,"work_seconds"?: number
                  }
                  Relationships: [
                    
                  ]
                },"queue_samples": {
                  Row: {
                    "at": string,"oldest_seconds": number | null,"waiting": number,"working": number
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"oldest_seconds"?: number | null,"waiting": number,"working": number
                  }
                  Update: {
                    "at"?: string,"oldest_seconds"?: number | null,"waiting"?: number,"working"?: number
                  }
                  Relationships: [
                    
                  ]
                },"targets": {
                  Row: {
                    "attempts": number,"claimed_at": string | null,"crew_id": string | null,"des": string,"done_at": string | null,"id": number,"msg_id": number | null,"posted_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"claimed_at"?: string | null,"crew_id"?: string | null,"des": string,"done_at"?: string | null,"id"?: never,"msg_id"?: number | null,"posted_at"?: string,"status"?: string
                  }
                  Update: {
                    "attempts"?: number,"claimed_at"?: string | null,"crew_id"?: string | null,"des"?: string,"done_at"?: string | null,"id"?: never,"msg_id"?: number | null,"posted_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "targets_crew_id_fkey"
      columns: ["crew_id"]
isOneToOne: false
      referencedRelation: "crew"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "targets_des_fkey"
      columns: ["des"]
isOneToOne: false
      referencedRelation: "asteroids"
      referencedColumns: ["des"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "announce":
{ Args: { "p_text": string }; Returns: undefined
                           },
"claim_target":
{ Args: Record<PropertyKey, never>; Returns: {
              "attempts": number,
"claimed_at": string | null,
"crew_id": string | null,
"des": string,
"done_at": string | null,
"id": number,
"msg_id": number | null,
"posted_at": string,
"status": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "targets"
        isOneToOne: false
        isSetofReturn: true
      } },
"control_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"finish_target":
{ Args: { "p_capture_km": number,"p_crew": string,"p_direction": string,"p_dv_ms": number,"p_lead_days": number,"p_mass_kg": number,"p_miss_km": number,"p_saved": boolean,"p_score": number,"p_target": number }; Returns: Json
                           },
"jd_now":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"log_event":
{ Args: { "p_crew"?: string,"p_detail"?: Json,"p_kind": string,"p_target"?: number }; Returns: undefined
                           },
"mission_tick":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"post_targets":
{ Args: { "p_count"?: number }; Returns: number
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
