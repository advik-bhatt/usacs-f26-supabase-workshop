
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
            "events": {
                  Row: {
                    "at": string,"detail": NonNullable<Json>,"id": number,"kind": string,"player_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind": string,"player_id"?: string | null
                  }
                  Update: {
                    "at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"kind"?: string,"player_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"game": {
                  Row: {
                    "allowance_cents": number,"id": boolean,"open": boolean,"par_base_s": number,"par_per_item_s": number,"par_per_step_s": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowance_cents"?: number,"id"?: boolean,"open"?: boolean,"par_base_s"?: number,"par_per_item_s"?: number,"par_per_step_s"?: number,"updated_at"?: string
                  }
                  Update: {
                    "allowance_cents"?: number,"id"?: boolean,"open"?: boolean,"par_base_s"?: number,"par_per_item_s"?: number,"par_per_step_s"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ingredients": {
                  Row: {
                    "name": string,"price_cents": number,"slug": string,"x": number,"y": number
                  }
                  ComputedFields: never
                  Insert: {
                    "name": string,"price_cents": number,"slug": string,"x": number,"y": number
                  }
                  Update: {
                    "name"?: string,"price_cents"?: number,"slug"?: string,"x"?: number,"y"?: number
                  }
                  Relationships: [
                    
                  ]
                },"player_state": {
                  Row: {
                    "location": string,"phase": string,"player_id": string,"run_id": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "location"?: string,"phase"?: string,"player_id": string,"run_id"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "location"?: string,"phase"?: string,"player_id"?: string,"run_id"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_state_player_id_fkey"
      columns: ["player_id"]
isOneToOne: true
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "player_state_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "avatar_path": string | null,"id": string,"joined_at": string,"kind": string,"name": string,"sprite": number,"xp": number
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"id"?: string,"joined_at"?: string,"kind"?: string,"name": string,"sprite"?: number,"xp"?: number
                  }
                  Update: {
                    "avatar_path"?: string | null,"id"?: string,"joined_at"?: string,"kind"?: string,"name"?: string,"sprite"?: number,"xp"?: number
                  }
                  Relationships: [
                    
                  ]
                },"purchases": {
                  Row: {
                    "at": string,"id": number,"ingredient": string,"player_id": string,"price_cents": number,"run_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"id"?: never,"ingredient": string,"player_id": string,"price_cents": number,"run_id": number
                  }
                  Update: {
                    "at"?: string,"id"?: never,"ingredient"?: string,"player_id"?: string,"price_cents"?: number,"run_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchases_ingredient_fkey"
      columns: ["ingredient"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "purchases_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "runs"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "ingredient": string,"recipe": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ingredient": string,"recipe": string
                  }
                  Update: {
                    "ingredient"?: string,"recipe"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_ingredient_fkey"
      columns: ["ingredient"]
isOneToOne: false
      referencedRelation: "ingredients"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "recipe_ingredients_recipe_fkey"
      columns: ["recipe"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["slug"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "base_points": number,"name": string,"slug": string,"stars": number,"steps": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "base_points": number,"name": string,"slug": string,"stars": number,"steps": (string)[]
                  }
                  Update: {
                    "base_points"?: number,"name"?: string,"slug"?: string,"stars"?: number,"steps"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"runs": {
                  Row: {
                    "budget_cents": number,"checkout_at": string | null,"finished_at": string | null,"id": number,"player_id": string,"rating": string | null,"recipes": (string)[],"result": Json | null,"score": number | null,"spent_cents": number,"started_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_cents": number,"checkout_at"?: string | null,"finished_at"?: string | null,"id"?: never,"player_id": string,"rating"?: string | null,"recipes": (string)[],"result"?: Json | null,"score"?: number | null,"spent_cents"?: number,"started_at"?: string,"status"?: string
                  }
                  Update: {
                    "budget_cents"?: number,"checkout_at"?: string | null,"finished_at"?: string | null,"id"?: never,"player_id"?: string,"rating"?: string | null,"recipes"?: (string)[],"result"?: Json | null,"score"?: number | null,"spent_cents"?: number,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "runs_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
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
"back_to_menu":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"buy":
{ Args: { "p_ingredient": string,"p_run": number }; Returns: Json
                           },
"cookable":
{ Args: { "p_run": number }; Returns: (string)[]
                           },
"dashboard":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"finish_run":
{ Args: { "p_accuracy": Json,"p_run": number }; Returns: Json
                           },
"head_home":
{ Args: { "p_run": number }; Returns: Json
                           },
"log_event":
{ Args: { "p_detail"?: Json,"p_kind": string,"p_player"?: string }; Returns: undefined
                           },
"menu_cost_cents":
{ Args: { "p_recipes": (string)[] }; Returns: number
                           },
"start_run":
{ Args: { "p_recipes": (string)[] }; Returns: Json
                           },
"tidy_up":
{ Args: Record<PropertyKey, never>; Returns: undefined
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
