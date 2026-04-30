export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          role: 'ADMIN' | 'OPERATOR' | 'REVIEWER' | 'VIEWER'
          site_id: string | null
          created_at: string
        }
        Insert: {
          id: string
          name: string
          role?: 'ADMIN' | 'OPERATOR' | 'REVIEWER' | 'VIEWER'
          site_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          role?: 'ADMIN' | 'OPERATOR' | 'REVIEWER' | 'VIEWER'
          site_id?: string | null
          created_at?: string
        }
      }
      sites: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
      }
      samples: {
        Row: {
          id: string
          sample_type: string
          sample_source: string | null
          collection_date: string | null
          submission_date: string | null
          status: 'PENDING' | 'IN_REVIEW' | 'FINALIZED'
          final_version_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          sample_type: string
          sample_source?: string | null
          collection_date?: string | null
          submission_date?: string | null
          status?: 'PENDING' | 'IN_REVIEW' | 'FINALIZED'
          final_version_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sample_type?: string
          sample_source?: string | null
          collection_date?: string | null
          submission_date?: string | null
          status?: 'PENDING' | 'IN_REVIEW' | 'FINALIZED'
          final_version_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      detection_records: {
        Row: {
          id: string
          sample_id: string
          site_id: string
          source_type: 'MANUAL' | 'IMPORT'
          operator_id: string
          remark: string | null
          created_at: string
        }
        Insert: {
          id?: string
          sample_id: string
          site_id: string
          source_type?: 'MANUAL' | 'IMPORT'
          operator_id: string
          remark?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          sample_id?: string
          site_id?: string
          source_type?: 'MANUAL' | 'IMPORT'
          operator_id?: string
          remark?: string | null
          created_at?: string
        }
      }
      detection_items: {
        Row: {
          id: string
          record_id: string
          project_name: string
          ct_value: number | null
          raw_text: string | null
          conclusion: string | null
          is_missing: boolean
          unit: string | null
        }
        Insert: {
          id?: string
          record_id: string
          project_name: string
          ct_value?: number | null
          raw_text?: string | null
          conclusion?: string | null
          is_missing?: boolean
          unit?: string | null
        }
        Update: {
          id?: string
          record_id?: string
          project_name?: string
          ct_value?: number | null
          raw_text?: string | null
          conclusion?: string | null
          is_missing?: boolean
          unit?: string | null
        }
      }
      versions: {
        Row: {
          id: string
          sample_id: string
          record_id: string
          version_no: number
          action_type: 'CREATE' | 'EDIT' | 'IMPORT'
          operator_id: string
          note: string | null
          is_latest: boolean
          is_final: boolean
          created_at: string
        }
        Insert: {
          id?: string
          sample_id: string
          record_id: string
          version_no: number
          action_type: 'CREATE' | 'EDIT' | 'IMPORT'
          operator_id: string
          note?: string | null
          is_latest?: boolean
          is_final?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          sample_id?: string
          record_id?: string
          version_no?: number
          action_type?: 'CREATE' | 'EDIT' | 'IMPORT'
          operator_id?: string
          note?: string | null
          is_latest?: boolean
          is_final?: boolean
          created_at?: string
        }
      }
      version_snapshots: {
        Row: {
          id: string
          version_id: string
          project_name: string
          ct_value: number | null
          raw_text: string | null
          conclusion: string | null
          is_missing: boolean
          unit: string | null
        }
        Insert: {
          id?: string
          version_id: string
          project_name: string
          ct_value?: number | null
          raw_text?: string | null
          conclusion?: string | null
          is_missing?: boolean
          unit?: string | null
        }
        Update: {
          id?: string
          version_id?: string
          project_name?: string
          ct_value?: number | null
          raw_text?: string | null
          conclusion?: string | null
          is_missing?: boolean
          unit?: string | null
        }
      }
      comparison_results: {
        Row: {
          id: string
          sample_id: string
          project_name: string
          version_ids: string[]
          min_ct: number | null
          max_ct: number | null
          ct_diff: number | null
          threshold: number
          comp_status: 'CONSISTENT' | 'DIVERGENT' | 'MISSING_DATA'
          needs_review: boolean
          calculated_at: string
        }
        Insert: {
          id?: string
          sample_id: string
          project_name: string
          version_ids: string[]
          min_ct?: number | null
          max_ct?: number | null
          ct_diff?: number | null
          threshold: number
          comp_status: 'CONSISTENT' | 'DIVERGENT' | 'MISSING_DATA'
          needs_review?: boolean
          calculated_at?: string
        }
        Update: {
          id?: string
          sample_id?: string
          project_name?: string
          version_ids?: string[]
          min_ct?: number | null
          max_ct?: number | null
          ct_diff?: number | null
          threshold?: number
          comp_status?: 'CONSISTENT' | 'DIVERGENT' | 'MISSING_DATA'
          needs_review?: boolean
          calculated_at?: string
        }
      }
      reviews: {
        Row: {
          id: string
          sample_id: string
          reviewer_id: string
          selected_version_id: string
          conclusion: 'ACCEPTED' | 'REJECTED'
          remark: string | null
          is_effective: boolean
          created_at: string
        }
        Insert: {
          id?: string
          sample_id: string
          reviewer_id: string
          selected_version_id: string
          conclusion: 'ACCEPTED' | 'REJECTED'
          remark?: string | null
          is_effective?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          sample_id?: string
          reviewer_id?: string
          selected_version_id?: string
          conclusion?: 'ACCEPTED' | 'REJECTED'
          remark?: string | null
          is_effective?: boolean
          created_at?: string
        }
      }
      system_config: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          entity_type: string
          entity_id: string
          detail: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: string
          entity_type: string
          entity_id: string
          detail?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          action?: string
          entity_type?: string
          entity_id?: string
          detail?: Json | null
          created_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      current_user_role: {
        Args: Record<string, never>
        Returns: 'ADMIN' | 'OPERATOR' | 'REVIEWER' | 'VIEWER'
      }
    }
    Enums: {
      user_role: 'ADMIN' | 'OPERATOR' | 'REVIEWER' | 'VIEWER'
      sample_status: 'PENDING' | 'IN_REVIEW' | 'FINALIZED'
      source_type: 'MANUAL' | 'IMPORT'
      version_action: 'CREATE' | 'EDIT' | 'IMPORT'
      comp_status: 'CONSISTENT' | 'DIVERGENT' | 'MISSING_DATA'
      review_conclusion: 'ACCEPTED' | 'REJECTED'
    }
  }
}
