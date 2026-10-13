// Generated from the production schema (Supabase "generate TypeScript types").
// Don't edit by hand: after a migration, regenerate (Supabase MCP
// generate_typescript_types, or `npx supabase gen types typescript --project-id xpvdodiadtycfyismcpl`)
// and replace this file.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_usage: {
        Row: { api: string; month: string; requests: number }
        Insert: { api: string; month: string; requests?: number }
        Update: { api?: string; month?: string; requests?: number }
        Relationships: []
      }
      appraiser_cache: {
        Row: {
          county_fips: string
          data: Json
          fetched_at: string
          parcel_id_norm: string
        }
        Insert: {
          county_fips: string
          data: Json
          fetched_at?: string
          parcel_id_norm: string
        }
        Update: {
          county_fips?: string
          data?: Json
          fetched_at?: string
          parcel_id_norm?: string
        }
        Relationships: []
      }
      auction_status_history: {
        Row: {
          auction_id: string
          changed_at: string
          id: number
          new_auction_date: string | null
          new_status: string
          old_auction_date: string | null
          old_status: string | null
        }
        Insert: {
          auction_id: string
          changed_at?: string
          id?: never
          new_auction_date?: string | null
          new_status: string
          old_auction_date?: string | null
          old_status?: string | null
        }
        Update: {
          auction_id?: string
          changed_at?: string
          id?: never
          new_auction_date?: string | null
          new_status?: string
          old_auction_date?: string | null
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_status_history_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
        ]
      }
      auctions: {
        Row: {
          auction_date: string
          appraiser_url: string | null
          assessed_value: number | null
          auction_time: string | null
          auction_url: string | null
          case_no: string
          certificate_no: string | null
          county_fips: string
          first_seen: string
          id: string
          last_seen: string
          opening_bid: number | null
          parcel_id: string | null
          parcel_id_norm: string | null
          property_address: string | null
          property_id: string | null
          sold_amount: number | null
          sold_at: string | null
          sold_to: string | null
          status: string
          status_detail: string | null
          updated_at: string
        }
        Insert: {
          auction_date: string
          appraiser_url?: string | null
          assessed_value?: number | null
          auction_time?: string | null
          auction_url?: string | null
          case_no: string
          certificate_no?: string | null
          county_fips: string
          first_seen?: string
          id?: string
          last_seen?: string
          opening_bid?: number | null
          parcel_id?: string | null
          parcel_id_norm?: string | null
          property_address?: string | null
          property_id?: string | null
          sold_amount?: number | null
          sold_at?: string | null
          sold_to?: string | null
          status: string
          status_detail?: string | null
          updated_at?: string
        }
        Update: {
          auction_date?: string
          appraiser_url?: string | null
          assessed_value?: number | null
          auction_time?: string | null
          auction_url?: string | null
          case_no?: string
          certificate_no?: string | null
          county_fips?: string
          first_seen?: string
          id?: string
          last_seen?: string
          opening_bid?: number | null
          parcel_id?: string | null
          parcel_id_norm?: string | null
          property_address?: string | null
          property_id?: string | null
          sold_amount?: number | null
          sold_at?: string | null
          sold_to?: string | null
          status?: string
          status_detail?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auctions_county_fips_fkey"
            columns: ["county_fips"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["fips"]
          },
          {
            foreignKeyName: "auctions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      boundaries: {
        Row: {
          area_sq_mi: number | null
          centroid: unknown
          created_at: string
          geoid: string
          geom: unknown
          geom_simplified: unknown
          id: number
          label: string
          layer: string
          name: string
          state: string | null
          state_fips: string | null
        }
        Insert: {
          area_sq_mi?: number | null
          centroid: unknown
          created_at?: string
          geoid: string
          geom: unknown
          geom_simplified: unknown
          id?: never
          label: string
          layer: string
          name: string
          state?: string | null
          state_fips?: string | null
        }
        Update: {
          area_sq_mi?: number | null
          centroid?: unknown
          created_at?: string
          geoid?: string
          geom?: unknown
          geom_simplified?: unknown
          id?: never
          label?: string
          layer?: string
          name?: string
          state?: string | null
          state_fips?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          email: string | null
          id: string
          phone: string | null
          property_id: string
          retrieved_at: string
          source: string
          user_id: string
        }
        Insert: {
          email?: string | null
          id?: string
          phone?: string | null
          property_id: string
          retrieved_at?: string
          source: string
          user_id?: string
        }
        Update: {
          email?: string | null
          id?: string
          phone?: string | null
          property_id?: string
          retrieved_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      counties: {
        Row: {
          activated_at: string | null
          auction_base_url: string | null
          auction_platform: string
          county_name: string
          created_at: string
          fips: string
          is_active: boolean
          last_scraped_at: string | null
          nal_county_code: string | null
          notes: string | null
          state: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          auction_base_url?: string | null
          auction_platform?: string
          county_name: string
          created_at?: string
          fips: string
          is_active?: boolean
          last_scraped_at?: string | null
          nal_county_code?: string | null
          notes?: string | null
          state: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          auction_base_url?: string | null
          auction_platform?: string
          county_name?: string
          created_at?: string
          fips?: string
          is_active?: boolean
          last_scraped_at?: string | null
          nal_county_code?: string | null
          notes?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      deal_events: {
        Row: {
          body: string | null
          counter_amount: number | null
          created_at: string
          id: string
          kind: string
          occurred_at: string
          offer_amount: number | null
          offer_response: string | null
          offer_terms: string | null
          offer_to: string | null
          outcome: string | null
          property_id: string
          user_id: string
        }
        Insert: {
          body?: string | null
          counter_amount?: number | null
          created_at?: string
          id?: string
          kind: string
          occurred_at?: string
          offer_amount?: number | null
          offer_response?: string | null
          offer_terms?: string | null
          offer_to?: string | null
          outcome?: string | null
          property_id: string
          user_id?: string
        }
        Update: {
          body?: string | null
          counter_amount?: number | null
          created_at?: string
          id?: string
          kind?: string
          occurred_at?: string
          offer_amount?: number | null
          offer_response?: string | null
          offer_terms?: string | null
          offer_to?: string | null
          outcome?: string | null
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      geocodes: {
        Row: {
          created_at: string
          lat: number | null
          lng: number | null
          match_quality: string | null
          matched_address: string | null
          normalized_address: string
          source: string
        }
        Insert: {
          created_at?: string
          lat?: number | null
          lng?: number | null
          match_quality?: string | null
          matched_address?: string | null
          normalized_address: string
          source?: string
        }
        Update: {
          created_at?: string
          lat?: number | null
          lng?: number | null
          match_quality?: string | null
          matched_address?: string | null
          normalized_address?: string
          source?: string
        }
        Relationships: []
      }
      hud_listings: {
        Row: {
          bid_deadline: string | null
          bid_open_date: string | null
          broker_name: string | null
          broker_phone: string | null
          eligible_203k: boolean | null
          fha_eligible: boolean | null
          fha_financing: string | null
          first_seen: string
          hud_case_no: string
          id: string
          last_seen: string
          list_price: number | null
          listing_period: string | null
          listing_url: string | null
          property_id: string | null
          raw: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          bid_deadline?: string | null
          bid_open_date?: string | null
          broker_name?: string | null
          broker_phone?: string | null
          eligible_203k?: boolean | null
          fha_eligible?: boolean | null
          fha_financing?: string | null
          first_seen?: string
          hud_case_no: string
          id?: string
          last_seen?: string
          list_price?: number | null
          listing_period?: string | null
          listing_url?: string | null
          property_id?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          bid_deadline?: string | null
          bid_open_date?: string | null
          broker_name?: string | null
          broker_phone?: string | null
          eligible_203k?: boolean | null
          fha_eligible?: boolean | null
          fha_financing?: string | null
          first_seen?: string
          hud_case_no?: string
          id?: string
          last_seen?: string
          list_price?: number | null
          listing_period?: string | null
          listing_url?: string | null
          property_id?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hud_listings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      nal_loads: {
        Row: {
          county_fips: string
          file_name: string | null
          loaded_at: string
          rows_loaded: number | null
          tax_year: number
        }
        Insert: {
          county_fips: string
          file_name?: string | null
          loaded_at?: string
          rows_loaded?: number | null
          tax_year: number
        }
        Update: {
          county_fips?: string
          file_name?: string | null
          loaded_at?: string
          rows_loaded?: number | null
          tax_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "nal_loads_county_fips_fkey"
            columns: ["county_fips"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["fips"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string
          id: string
          property_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          property_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          property_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          absentee: boolean | null
          id: string
          mailing_address: string | null
          mailing_city: string | null
          mailing_state: string | null
          mailing_zip: string | null
          name: string
          out_of_state: boolean | null
          owner_type: string | null
          property_id: string
          source: string
          updated_at: string
        }
        Insert: {
          absentee?: boolean | null
          id?: string
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          name: string
          out_of_state?: boolean | null
          owner_type?: string | null
          property_id: string
          source: string
          updated_at?: string
        }
        Update: {
          absentee?: boolean | null
          id?: string
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          name?: string
          out_of_state?: boolean | null
          owner_type?: string | null
          property_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owners_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          attribution: string | null
          created_at: string
          height: number | null
          id: string
          meta: Json | null
          property_id: string
          sort_order: number
          source: string
          source_url: string | null
          storage_path: string | null
          thumb_path: string | null
          width: number | null
        }
        Insert: {
          attribution?: string | null
          created_at?: string
          height?: number | null
          id?: string
          meta?: Json | null
          property_id: string
          sort_order?: number
          source: string
          source_url?: string | null
          storage_path?: string | null
          thumb_path?: string | null
          width?: number | null
        }
        Update: {
          attribution?: string | null
          created_at?: string
          height?: number | null
          id?: string
          meta?: Json | null
          property_id?: string
          sort_order?: number
          source?: string
          source_url?: string | null
          storage_path?: string | null
          thumb_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_sales: {
        Row: {
          book_page: string | null
          id: number
          instrument: string | null
          price: number | null
          property_id: string
          qualified: boolean | null
          sale_date: string | null
          source: string
        }
        Insert: {
          book_page?: string | null
          id?: never
          instrument?: string | null
          price?: number | null
          property_id: string
          qualified?: boolean | null
          sale_date?: string | null
          source: string
        }
        Update: {
          book_page?: string | null
          id?: never
          instrument?: string | null
          price?: number | null
          property_id?: string
          qualified?: boolean | null
          sale_date?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_sales_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_admin: boolean
          last_search: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          is_admin?: boolean
          last_search?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_admin?: boolean
          last_search?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          appraiser_url: string | null
          assessed_value: number | null
          baths: number | null
          beds: number | null
          city: string | null
          county_fips: string | null
          created_at: string
          homestead: boolean | null
          id: string
          land_use: string | null
          land_use_code: string | null
          last_sale_date: string | null
          last_sale_price: number | null
          lat: number | null
          lng: number | null
          location: unknown
          location_unknown: boolean
          lot_size_sqft: number | null
          market_value: number | null
          parcel_id: string | null
          parcel_id_norm: string | null
          place_geoid: string | null
          property_type: string | null
          source_key: string
          sqft: number | null
          state: string
          updated_at: string
          year_built: number | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          appraiser_url?: string | null
          assessed_value?: number | null
          baths?: number | null
          beds?: number | null
          city?: string | null
          county_fips?: string | null
          created_at?: string
          homestead?: boolean | null
          id?: string
          land_use?: string | null
          land_use_code?: string | null
          last_sale_date?: string | null
          last_sale_price?: number | null
          lat?: never
          lng?: never
          location?: unknown
          location_unknown?: boolean
          lot_size_sqft?: number | null
          market_value?: number | null
          parcel_id?: string | null
          parcel_id_norm?: string | null
          place_geoid?: string | null
          property_type?: string | null
          source_key: string
          sqft?: number | null
          state?: string
          updated_at?: string
          year_built?: number | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          appraiser_url?: string | null
          assessed_value?: number | null
          baths?: number | null
          beds?: number | null
          city?: string | null
          county_fips?: string | null
          created_at?: string
          homestead?: boolean | null
          id?: string
          land_use?: string | null
          land_use_code?: string | null
          last_sale_date?: string | null
          last_sale_price?: number | null
          lat?: never
          lng?: never
          location?: unknown
          location_unknown?: boolean
          lot_size_sqft?: number | null
          market_value?: number | null
          parcel_id?: string | null
          parcel_id_norm?: string | null
          place_geoid?: string | null
          property_type?: string | null
          source_key?: string
          sqft?: number | null
          state?: string
          updated_at?: string
          year_built?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_county_fips_fkey"
            columns: ["county_fips"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["fips"]
          },
        ]
      }
      saved_properties: {
        Row: {
          created_at: string
          next_follow_up: string | null
          position: number
          property_id: string
          status: string
          strategy: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          next_follow_up?: string | null
          position?: number
          property_id: string
          status?: string
          strategy?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          next_follow_up?: string | null
          position?: number
          property_id?: string
          status?: string
          strategy?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_runs: {
        Row: {
          adapter: string
          county_fips: string | null
          error_log: Json
          errors: number
          finished_at: string | null
          id: number
          items_found: number
          items_upserted: number
          started_at: string
          stats: Json
          status: string
        }
        Insert: {
          adapter: string
          county_fips?: string | null
          error_log?: Json
          errors?: number
          finished_at?: string | null
          id?: never
          items_found?: number
          items_upserted?: number
          started_at?: string
          stats?: Json
          status?: string
        }
        Update: {
          adapter?: string
          county_fips?: string | null
          error_log?: Json
          errors?: number
          finished_at?: string | null
          id?: never
          items_found?: number
          items_upserted?: number
          started_at?: string
          stats?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_runs_county_fips_fkey"
            columns: ["county_fips"]
            isOneToOne: false
            referencedRelation: "counties"
            referencedColumns: ["fips"]
          },
        ]
      }
    }
    Views: {
      listings_feed: {
        Row: {
          address: string | null
          baths: number | null
          beds: number | null
          city: string | null
          county_fips: string | null
          deal_score: number | null
          deal_tier: string | null
          event_date: string | null
          first_seen: string | null
          has_building: boolean | null
          is_closed: boolean | null
          land_use: string | null
          listing_address: string | null
          listing_county_fips: string | null
          listing_id: string | null
          listing_status: string | null
          listing_url: string | null
          location: unknown
          location_unknown: boolean | null
          lot_size_sqft: number | null
          market_value: number | null
          parcel_id: string | null
          place_geoid: string | null
          price: number | null
          property_id: string | null
          property_type: string | null
          ref_no: string | null
          source: string | null
          sqft: number | null
          value_ratio: number | null
          year_built: number | null
          zip: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      boundaries_in_view: {
        Args: {
          p_layer: string
          p_max_lat: number
          p_max_lng: number
          p_min_lat: number
          p_min_lng: number
          p_zoom: number
        }
        Returns: Json
      }
      data_updated_at: { Args: never; Returns: string }
      ensure_area_coverage: {
        Args: {
          p_area_geoid?: string
          p_area_layer?: string
          p_lat?: number
          p_lng?: number
          p_radius_mi?: number
        }
        Returns: Json
      }
      get_area: {
        Args: { p_geoid?: string; p_label?: string; p_layer: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      link_auctions_to_properties: {
        Args: { p_county_fips?: string }
        Returns: number
      }
      normalize_parcel_id: { Args: { p: string }; Returns: string }
      public_stats: { Args: never; Returns: Json }
      refresh_property_areas: { Args: never; Returns: number }
      search_properties: {
        Args: {
          p_area_geoid?: string
          p_area_geojson?: Json
          p_area_layer?: string
          p_filters?: Json
          p_lat?: number
          p_lng?: number
          p_page?: number
          p_page_size?: number
          p_radius_mi?: number
          p_sort?: string
        }
        Returns: Json
      }
      suggest_places: {
        Args: { q: string }
        Returns: {
          bbox: number[]
          geoid: string
          label: string
          lat: number
          layer: string
          lng: number
          state: string
        }[]
      }
      upsert_boundaries: { Args: { features: Json }; Returns: number }
      use_api_quota: { Args: { p_api: string; p_limit: number }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database["public"]

/** Row type of a table or view: Tables<"properties"> */
export type Tables<T extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])> =
  (DefaultSchema["Tables"] & DefaultSchema["Views"])[T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"]
