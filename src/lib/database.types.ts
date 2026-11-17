
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
            "cooks": {
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
                },"events": {
                  Row: {
                    "at": string,"cook_id": string | null,"detail": NonNullable<Json>,"id": number,"kind": string,"ticket_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"cook_id"?: string | null,"detail"?: NonNullable<Json>,"id"?: never,"kind": string,"ticket_id"?: number | null
                  }
                  Update: {
                    "at"?: string,"cook_id"?: string | null,"detail"?: NonNullable<Json>,"id"?: never,"kind"?: string,"ticket_id"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"queue_samples": {
                  Row: {
                    "at": string,"cooking": number,"oldest_seconds": number | null,"waiting": number
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"cooking": number,"oldest_seconds"?: number | null,"waiting": number
                  }
                  Update: {
                    "at"?: string,"cooking"?: number,"oldest_seconds"?: number | null,"waiting"?: number
                  }
                  Relationships: [
                    
                  ]
                },"serves": {
                  Row: {
                    "cook_id": string,"correct": boolean,"id": number,"score": number,"seconds": number,"served_at": string,"ticket_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cook_id": string,"correct": boolean,"id"?: never,"score": number,"seconds": number,"served_at"?: string,"ticket_id": number
                  }
                  Update: {
                    "cook_id"?: string,"correct"?: boolean,"id"?: never,"score"?: number,"seconds"?: number,"served_at"?: string,"ticket_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "serves_cook_id_fkey"
      columns: ["cook_id"]
isOneToOne: false
      referencedRelation: "cooks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "serves_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: true
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"shift": {
                  Row: {
                    "cook_seconds": number,"id": boolean,"open": boolean,"patience_seconds": number,"tickets_per_tick": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cook_seconds"?: number,"id"?: boolean,"open"?: boolean,"patience_seconds"?: number,"tickets_per_tick"?: number,"updated_at"?: string
                  }
                  Update: {
                    "cook_seconds"?: number,"id"?: boolean,"open"?: boolean,"patience_seconds"?: number,"tickets_per_tick"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tickets": {
                  Row: {
                    "attempts": number,"claimed_at": string | null,"cook_id": string | null,"done_at": string | null,"id": number,"msg_id": number | null,"placed_at": string,"size": string,"status": string,"toppings": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"claimed_at"?: string | null,"cook_id"?: string | null,"done_at"?: string | null,"id"?: never,"msg_id"?: number | null,"placed_at"?: string,"size": string,"status"?: string,"toppings": (string)[]
                  }
                  Update: {
                    "attempts"?: number,"claimed_at"?: string | null,"cook_id"?: string | null,"done_at"?: string | null,"id"?: never,"msg_id"?: number | null,"placed_at"?: string,"size"?: string,"status"?: string,"toppings"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "tickets_cook_id_fkey"
      columns: ["cook_id"]
isOneToOne: false
      referencedRelation: "cooks"
      referencedColumns: ["id"]
    }
                  ]
                },"tips": {
                  Row: {
                    "cents": number,"cook_id": string,"created_at": string,"id": number,"ticket_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cents": number,"cook_id": string,"created_at"?: string,"id"?: never,"ticket_id"?: number | null
                  }
                  Update: {
                    "cents"?: number,"cook_id"?: string,"created_at"?: string,"id"?: never,"ticket_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tips_cook_id_fkey"
      columns: ["cook_id"]
isOneToOne: false
      referencedRelation: "cooks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tips_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"toppings": {
                  Row: {
                    "emoji": string,"label": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "emoji": string,"label": string,"slug": string
                  }
                  Update: {
                    "emoji"?: string,"label"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "finish_ticket":
{ Args: { "p_cook": string,"p_correct": boolean,"p_detail"?: Json,"p_score": number,"p_ticket": number,"p_tip_cents": number }; Returns: Json
                           },
"grab_ticket":
{ Args: Record<PropertyKey, never>; Returns: {
              "attempts": number,
"claimed_at": string | null,
"cook_id": string | null,
"done_at": string | null,
"id": number,
"msg_id": number | null,
"placed_at": string,
"size": string,
"status": string,
"toppings": (string)[]
            }[]
                          SetofOptions: {
        from: "*"
        to: "tickets"
        isOneToOne: false
        isSetofReturn: true
      } },
"kitchen_tick":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"log_event":
{ Args: { "p_cook"?: string,"p_detail"?: Json,"p_kind": string,"p_ticket"?: number }; Returns: undefined
                           },
"pass_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"place_orders":
{ Args: { "p_count"?: number }; Returns: number
                           },
"shout":
{ Args: { "p_text": string }; Returns: undefined
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
