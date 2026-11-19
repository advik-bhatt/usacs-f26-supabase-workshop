
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
            "accounts": {
                  Row: {
                    "cash_cents": number,"reserved_cents": number,"trader_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cash_cents": number,"reserved_cents"?: number,"trader_id": string
                  }
                  Update: {
                    "cash_cents"?: number,"reserved_cents"?: number,"trader_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_trader_id_fkey"
      columns: ["trader_id"]
isOneToOne: true
      referencedRelation: "traders"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "at": string,"detail": NonNullable<Json>,"id": number,"kind": string,"symbol": string | null,"trader_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind": string,"symbol"?: string | null,"trader_id"?: string | null
                  }
                  Update: {
                    "at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind"?: string,"symbol"?: string | null,"trader_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"fills": {
                  Row: {
                    "at": string,"id": number,"order_id": number,"price_cents": number,"qty": number,"side": string,"symbol": string,"trade_id": number,"trader_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"id"?: never,"order_id": number,"price_cents": number,"qty": number,"side": string,"symbol": string,"trade_id": number,"trader_id": string
                  }
                  Update: {
                    "at"?: string,"id"?: never,"order_id"?: number,"price_cents"?: number,"qty"?: number,"side"?: string,"symbol"?: string,"trade_id"?: number,"trader_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fills_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fills_trade_id_fkey"
      columns: ["trade_id"]
isOneToOne: false
      referencedRelation: "trades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fills_trader_id_fkey"
      columns: ["trader_id"]
isOneToOne: false
      referencedRelation: "traders"
      referencedColumns: ["id"]
    }
                  ]
                },"market": {
                  Row: {
                    "allowance_cents": number,"breaker_pct": number,"halt_seconds": number,"id": boolean,"open": boolean,"starting_shares": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowance_cents"?: number,"breaker_pct"?: number,"halt_seconds"?: number,"id"?: boolean,"open"?: boolean,"starting_shares"?: number,"updated_at"?: string
                  }
                  Update: {
                    "allowance_cents"?: number,"breaker_pct"?: number,"halt_seconds"?: number,"id"?: boolean,"open"?: boolean,"starting_shares"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"news": {
                  Row: {
                    "at": string,"headline": string,"id": number,"mood": string,"symbol": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"headline": string,"id"?: never,"mood"?: string,"symbol"?: string | null
                  }
                  Update: {
                    "at"?: string,"headline"?: string,"id"?: never,"mood"?: string,"symbol"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "news_symbol_fkey"
      columns: ["symbol"]
isOneToOne: false
      referencedRelation: "stocks"
      referencedColumns: ["symbol"]
    }
                  ]
                },"orders": {
                  Row: {
                    "created_at": string,"filled": number,"id": number,"kind": string,"limit_cents": number | null,"qty": number,"side": string,"status": string,"symbol": string,"trader_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"filled"?: number,"id"?: never,"kind": string,"limit_cents"?: number | null,"qty": number,"side": string,"status"?: string,"symbol": string,"trader_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"filled"?: number,"id"?: never,"kind"?: string,"limit_cents"?: number | null,"qty"?: number,"side"?: string,"status"?: string,"symbol"?: string,"trader_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_symbol_fkey"
      columns: ["symbol"]
isOneToOne: false
      referencedRelation: "stocks"
      referencedColumns: ["symbol"]
    },{
      foreignKeyName: "orders_trader_id_fkey"
      columns: ["trader_id"]
isOneToOne: false
      referencedRelation: "traders"
      referencedColumns: ["id"]
    }
                  ]
                },"positions": {
                  Row: {
                    "qty": number,"reserved": number,"symbol": string,"trader_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "qty": number,"reserved"?: number,"symbol": string,"trader_id": string
                  }
                  Update: {
                    "qty"?: number,"reserved"?: number,"symbol"?: string,"trader_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "positions_symbol_fkey"
      columns: ["symbol"]
isOneToOne: false
      referencedRelation: "stocks"
      referencedColumns: ["symbol"]
    },{
      foreignKeyName: "positions_trader_id_fkey"
      columns: ["trader_id"]
isOneToOne: false
      referencedRelation: "traders"
      referencedColumns: ["id"]
    }
                  ]
                },"price_samples": {
                  Row: {
                    "at": string,"last_cents": number,"symbol": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"last_cents": number,"symbol": string
                  }
                  Update: {
                    "at"?: string,"last_cents"?: number,"symbol"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_samples_symbol_fkey"
      columns: ["symbol"]
isOneToOne: false
      referencedRelation: "stocks"
      referencedColumns: ["symbol"]
    }
                  ]
                },"stocks": {
                  Row: {
                    "blurb": string,"halted_until": string | null,"last_cents": number,"name": string,"open_cents": number,"symbol": string,"updated_at": string,"volume": number
                  }
                  ComputedFields: never
                  Insert: {
                    "blurb": string,"halted_until"?: string | null,"last_cents": number,"name": string,"open_cents": number,"symbol": string,"updated_at"?: string,"volume"?: number
                  }
                  Update: {
                    "blurb"?: string,"halted_until"?: string | null,"last_cents"?: number,"name"?: string,"open_cents"?: number,"symbol"?: string,"updated_at"?: string,"volume"?: number
                  }
                  Relationships: [
                    
                  ]
                },"traders": {
                  Row: {
                    "avatar_path": string | null,"id": string,"joined_at": string,"kind": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"id"?: string,"joined_at"?: string,"kind"?: string,"name": string
                  }
                  Update: {
                    "avatar_path"?: string | null,"id"?: string,"joined_at"?: string,"kind"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"trades": {
                  Row: {
                    "at": string,"id": number,"price_cents": number,"qty": number,"symbol": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"id"?: never,"price_cents": number,"qty": number,"symbol": string
                  }
                  Update: {
                    "at"?: string,"id"?: never,"price_cents"?: number,"qty"?: number,"symbol"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trades_symbol_fkey"
      columns: ["symbol"]
isOneToOne: false
      referencedRelation: "stocks"
      referencedColumns: ["symbol"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "cancel_order":
{ Args: { "p_order": number }; Returns: Json
                           },
"floor_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"log_event":
{ Args: { "p_detail"?: Json,"p_kind": string,"p_symbol"?: string,"p_trader"?: string }; Returns: undefined
                           },
"market_tick":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"new_session":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"news":
{ Args: { "p_headline": string,"p_mood"?: string,"p_symbol": string }; Returns: number
                           },
"order_book":
{ Args: { "p_depth"?: number,"p_symbol": string }; Returns: Json
                           },
"place_order":
{ Args: { "p_kind": string,"p_limit_cents"?: number,"p_qty": number,"p_side": string,"p_symbol": string }; Returns: Json
                           },
"reject":
{ Args: { "p_detail"?: Json,"p_reason": string,"p_symbol": string,"p_trader": string }; Returns: Json
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
