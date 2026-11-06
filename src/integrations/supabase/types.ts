export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_date: string;
          appointment_time: string;
          confirmed_at: string | null;
          created_at: string;
          duration_minutes: number;
          id: string;
          legacy_patient_id: number | null;
          notes: string | null;
          patient_email: string | null;
          patient_id: string | null;
          patient_name: string;
          patient_phone: string;
          reminder_sent_at: string | null;
          service_id: string | null;
          service_name: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        Insert: {
          appointment_date: string;
          appointment_time: string;
          confirmed_at?: string | null;
          created_at?: string;
          duration_minutes?: number;
          id?: string;
          legacy_patient_id?: number | null;
          notes?: string | null;
          patient_email?: string | null;
          patient_id?: string | null;
          patient_name: string;
          patient_phone: string;
          reminder_sent_at?: string | null;
          service_id?: string | null;
          service_name: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          appointment_date?: string;
          appointment_time?: string;
          confirmed_at?: string | null;
          created_at?: string;
          duration_minutes?: number;
          id?: string;
          legacy_patient_id?: number | null;
          notes?: string | null;
          patient_email?: string | null;
          patient_id?: string | null;
          patient_name?: string;
          patient_phone?: string;
          reminder_sent_at?: string | null;
          service_id?: string | null;
          service_name?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      assessments: {
        Row: {
          client_id: string;
          created_at: string | null;
          date: string | null;
          id: string;
          notes: string | null;
          result: string;
          type: string;
        };
        Insert: {
          client_id: string;
          created_at?: string | null;
          date?: string | null;
          id?: string;
          notes?: string | null;
          result: string;
          type: string;
        };
        Update: {
          client_id?: string;
          created_at?: string | null;
          date?: string | null;
          id?: string;
          notes?: string | null;
          result?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_workouts: {
        Row: {
          assigned_date: string | null;
          client_id: string;
          completed_sessions: number | null;
          created_at: string | null;
          id: string;
          status: string | null;
          workout_id: string;
        };
        Insert: {
          assigned_date?: string | null;
          client_id: string;
          completed_sessions?: number | null;
          created_at?: string | null;
          id?: string;
          status?: string | null;
          workout_id: string;
        };
        Update: {
          assigned_date?: string | null;
          client_id?: string;
          completed_sessions?: number | null;
          created_at?: string | null;
          id?: string;
          status?: string | null;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_workouts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_workouts_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          age: number | null;
          birth_date: string | null;
          completion_rate: number | null;
          created_at: string | null;
          email: string | null;
          full_name: string;
          goal_weight: number | null;
          height: number | null;
          id: string;
          imc: number | null;
          last_workout_at: string | null;
          notes: string | null;
          objective: string | null;
          phone: string | null;
          plan: string | null;
          status: string | null;
          trainer_id: string;
          updated_at: string | null;
          weight: number | null;
        };
        Insert: {
          age?: number | null;
          birth_date?: string | null;
          completion_rate?: number | null;
          created_at?: string | null;
          email?: string | null;
          full_name: string;
          goal_weight?: number | null;
          height?: number | null;
          id?: string;
          imc?: number | null;
          last_workout_at?: string | null;
          notes?: string | null;
          objective?: string | null;
          phone?: string | null;
          plan?: string | null;
          status?: string | null;
          trainer_id: string;
          updated_at?: string | null;
          weight?: number | null;
        };
        Update: {
          age?: number | null;
          birth_date?: string | null;
          completion_rate?: number | null;
          created_at?: string | null;
          email?: string | null;
          full_name?: string;
          goal_weight?: number | null;
          height?: number | null;
          id?: string;
          imc?: number | null;
          last_workout_at?: string | null;
          notes?: string | null;
          objective?: string | null;
          phone?: string | null;
          plan?: string | null;
          status?: string | null;
          trainer_id?: string;
          updated_at?: string | null;
          weight?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
        ];
      };
      clinical_records: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          metadata: Json | null;
          patient_id: string;
          record_date: string;
          record_type: string;
          title: string | null;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          patient_id: string;
          record_date?: string;
          record_type?: string;
          title?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          patient_id?: string;
          record_date?: string;
          record_type?: string;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clinical_records_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          client_id: string;
          created_at: string | null;
          id: string;
          last_message: string | null;
          last_message_at: string | null;
          trainer_id: string;
          unread_client: number | null;
          unread_trainer: number | null;
        };
        Insert: {
          client_id: string;
          created_at?: string | null;
          id?: string;
          last_message?: string | null;
          last_message_at?: string | null;
          trainer_id: string;
          unread_client?: number | null;
          unread_trainer?: number | null;
        };
        Update: {
          client_id?: string;
          created_at?: string | null;
          id?: string;
          last_message?: string | null;
          last_message_at?: string | null;
          trainer_id?: string;
          unread_client?: number | null;
          unread_trainer?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
        ];
      };
      exercise_logs: {
        Row: {
          completed: boolean | null;
          created_at: string | null;
          exercise_name: string;
          id: string;
          reps_done: string | null;
          session_id: string;
          set_number: number;
          weight_used: number | null;
        };
        Insert: {
          completed?: boolean | null;
          created_at?: string | null;
          exercise_name: string;
          id?: string;
          reps_done?: string | null;
          session_id: string;
          set_number: number;
          weight_used?: number | null;
        };
        Update: {
          completed?: boolean | null;
          created_at?: string | null;
          exercise_name?: string;
          id?: string;
          reps_done?: string | null;
          session_id?: string;
          set_number?: number;
          weight_used?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_logs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      exercises: {
        Row: {
          created_at: string | null;
          equipment: string;
          id: string;
          instructions: string | null;
          is_public: boolean | null;
          muscle_group: string;
          name: string;
          trainer_id: string | null;
          video_url: string | null;
        };
        Insert: {
          created_at?: string | null;
          equipment: string;
          id?: string;
          instructions?: string | null;
          is_public?: boolean | null;
          muscle_group: string;
          name: string;
          trainer_id?: string | null;
          video_url?: string | null;
        };
        Update: {
          created_at?: string | null;
          equipment?: string;
          id?: string;
          instructions?: string | null;
          is_public?: boolean | null;
          muscle_group?: string;
          name?: string;
          trainer_id?: string | null;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "exercises_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
        ];
      };
      measurements: {
        Row: {
          arms: number | null;
          body_fat: number | null;
          chest: number | null;
          client_id: string;
          created_at: string | null;
          date: string | null;
          hips: number | null;
          id: string;
          shoulders: number | null;
          thighs: number | null;
          waist: number | null;
          weight: number | null;
        };
        Insert: {
          arms?: number | null;
          body_fat?: number | null;
          chest?: number | null;
          client_id: string;
          created_at?: string | null;
          date?: string | null;
          hips?: number | null;
          id?: string;
          shoulders?: number | null;
          thighs?: number | null;
          waist?: number | null;
          weight?: number | null;
        };
        Update: {
          arms?: number | null;
          body_fat?: number | null;
          chest?: number | null;
          client_id?: string;
          created_at?: string | null;
          date?: string | null;
          hips?: number | null;
          id?: string;
          shoulders?: number | null;
          thighs?: number | null;
          waist?: number | null;
          weight?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "measurements_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      message_templates: {
        Row: {
          body: string;
          channel: string;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          is_default: boolean | null;
          name: string;
          subject: string | null;
          type: Database["public"]["Enums"]["template_type"];
          updated_at: string | null;
        };
        Insert: {
          body: string;
          channel: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_default?: boolean | null;
          name: string;
          subject?: string | null;
          type: Database["public"]["Enums"]["template_type"];
          updated_at?: string | null;
        };
        Update: {
          body?: string;
          channel?: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          is_default?: boolean | null;
          name?: string;
          subject?: string | null;
          type?: Database["public"]["Enums"]["template_type"];
          updated_at?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string | null;
          id: string;
          read: boolean | null;
          sender_id: string;
          sender_type: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string | null;
          id?: string;
          read?: boolean | null;
          sender_id: string;
          sender_type?: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string | null;
          id?: string;
          read?: boolean | null;
          sender_id?: string;
          sender_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      odontogram_procedures: {
        Row: {
          cost: number | null;
          created_at: string;
          id: string;
          notes: string | null;
          odontogram_id: string;
          procedure_name: string;
          status: string;
          surfaces: string[] | null;
          tooth_number: number;
        };
        Insert: {
          cost?: number | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          odontogram_id: string;
          procedure_name: string;
          status?: string;
          surfaces?: string[] | null;
          tooth_number: number;
        };
        Update: {
          cost?: number | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          odontogram_id?: string;
          procedure_name?: string;
          status?: string;
          surfaces?: string[] | null;
          tooth_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "odontogram_procedures_odontogram_id_fkey";
            columns: ["odontogram_id"];
            isOneToOne: false;
            referencedRelation: "odontograms";
            referencedColumns: ["id"];
          },
        ];
      };
      odontograms: {
        Row: {
          dentition_type: string;
          id: string;
          notes: string | null;
          patient_id: string;
          updated_at: string;
        };
        Insert: {
          dentition_type?: string;
          id?: string;
          notes?: string | null;
          patient_id: string;
          updated_at?: string;
        };
        Update: {
          dentition_type?: string;
          id?: string;
          notes?: string | null;
          patient_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "odontograms_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: true;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          address: string | null;
          address_extra: string | null;
          address_number: string | null;
          birth_date: string | null;
          city: string | null;
          cpf: string | null;
          created_at: string;
          email: string | null;
          gender: string | null;
          id: string;
          insurance: string | null;
          insurance_number: string | null;
          is_inactive: boolean | null;
          legacy_patient_id: number | null;
          marital_status: string | null;
          medical_warning: string | null;
          name: string;
          neighborhood: string | null;
          notes: string | null;
          origin: string | null;
          phone: string | null;
          phone2: string | null;
          postal_code: string | null;
          profession: string | null;
          record_number: number;
          rg: string | null;
          state: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          address_extra?: string | null;
          address_number?: string | null;
          birth_date?: string | null;
          city?: string | null;
          cpf?: string | null;
          created_at?: string;
          email?: string | null;
          gender?: string | null;
          id?: string;
          insurance?: string | null;
          insurance_number?: string | null;
          is_inactive?: boolean | null;
          legacy_patient_id?: number | null;
          marital_status?: string | null;
          medical_warning?: string | null;
          name: string;
          neighborhood?: string | null;
          notes?: string | null;
          origin?: string | null;
          phone?: string | null;
          phone2?: string | null;
          postal_code?: string | null;
          profession?: string | null;
          record_number?: number;
          rg?: string | null;
          state?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          address_extra?: string | null;
          address_number?: string | null;
          birth_date?: string | null;
          city?: string | null;
          cpf?: string | null;
          created_at?: string;
          email?: string | null;
          gender?: string | null;
          id?: string;
          insurance?: string | null;
          insurance_number?: string | null;
          is_inactive?: boolean | null;
          legacy_patient_id?: number | null;
          marital_status?: string | null;
          medical_warning?: string | null;
          name?: string;
          neighborhood?: string | null;
          notes?: string | null;
          origin?: string | null;
          phone?: string | null;
          phone2?: string | null;
          postal_code?: string | null;
          profession?: string | null;
          record_number?: number;
          rg?: string | null;
          state?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_plans: {
        Row: {
          active: boolean | null;
          billing_cycle: string | null;
          created_at: string | null;
          description: string | null;
          features: string[] | null;
          id: string;
          name: string;
          price: number;
          trainer_id: string;
        };
        Insert: {
          active?: boolean | null;
          billing_cycle?: string | null;
          created_at?: string | null;
          description?: string | null;
          features?: string[] | null;
          id?: string;
          name: string;
          price: number;
          trainer_id: string;
        };
        Update: {
          active?: boolean | null;
          billing_cycle?: string | null;
          created_at?: string | null;
          description?: string | null;
          features?: string[] | null;
          id?: string;
          name?: string;
          price?: number;
          trainer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_plans_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          client_id: string;
          client_name: string | null;
          created_at: string | null;
          description: string;
          due_date: string | null;
          id: string;
          paid_at: string | null;
          payment_method: string | null;
          status: string | null;
          trainer_id: string;
        };
        Insert: {
          amount: number;
          client_id: string;
          client_name?: string | null;
          created_at?: string | null;
          description: string;
          due_date?: string | null;
          id?: string;
          paid_at?: string | null;
          payment_method?: string | null;
          status?: string | null;
          trainer_id: string;
        };
        Update: {
          amount?: number;
          client_id?: string;
          client_name?: string | null;
          created_at?: string | null;
          description?: string;
          due_date?: string | null;
          id?: string;
          paid_at?: string | null;
          payment_method?: string | null;
          status?: string | null;
          trainer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      progress_photos: {
        Row: {
          client_id: string;
          created_at: string | null;
          date: string | null;
          id: string;
          label: string | null;
          notes: string | null;
          url: string;
        };
        Insert: {
          client_id: string;
          created_at?: string | null;
          date?: string | null;
          id?: string;
          label?: string | null;
          notes?: string | null;
          url: string;
        };
        Update: {
          client_id?: string;
          created_at?: string | null;
          date?: string | null;
          id?: string;
          label?: string | null;
          notes?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "progress_photos_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      schedules: {
        Row: {
          client_id: string;
          created_at: string | null;
          duration_minutes: number | null;
          id: string;
          scheduled_date: string;
          scheduled_time: string;
          status: string | null;
          trainer_id: string;
          workout_id: string | null;
          workout_name: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string | null;
          duration_minutes?: number | null;
          id?: string;
          scheduled_date: string;
          scheduled_time: string;
          status?: string | null;
          trainer_id: string;
          workout_id?: string | null;
          workout_name?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string | null;
          duration_minutes?: number | null;
          id?: string;
          scheduled_date?: string;
          scheduled_time?: string;
          status?: string | null;
          trainer_id?: string;
          workout_id?: string | null;
          workout_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "schedules_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedules_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedules_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          category: string | null;
          created_at: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          is_active: boolean;
          name: string;
          price: number | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          name: string;
          price?: number | null;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
          price?: number | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      trainers: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          business_address: string | null;
          business_name: string | null;
          business_phone: string | null;
          created_at: string | null;
          cref: string | null;
          email: string;
          full_name: string;
          id: string;
          phone: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          business_address?: string | null;
          business_name?: string | null;
          business_phone?: string | null;
          created_at?: string | null;
          cref?: string | null;
          email: string;
          full_name: string;
          id?: string;
          phone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          business_address?: string | null;
          business_name?: string | null;
          business_phone?: string | null;
          created_at?: string | null;
          cref?: string | null;
          email?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      workout_exercises: {
        Row: {
          exercise_id: string;
          id: string;
          notes: string | null;
          order: number;
          reps: string;
          rest_seconds: number | null;
          sets: number;
          workout_id: string;
        };
        Insert: {
          exercise_id: string;
          id?: string;
          notes?: string | null;
          order?: number;
          reps?: string;
          rest_seconds?: number | null;
          sets?: number;
          workout_id: string;
        };
        Update: {
          exercise_id?: string;
          id?: string;
          notes?: string | null;
          order?: number;
          reps?: string;
          rest_seconds?: number | null;
          sets?: number;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_sessions: {
        Row: {
          client_id: string;
          client_workout_id: string | null;
          completed_exercises: number | null;
          created_at: string | null;
          duration_seconds: number | null;
          ended_at: string | null;
          id: string;
          notes: string | null;
          started_at: string | null;
          total_exercises: number | null;
          workout_name: string;
        };
        Insert: {
          client_id: string;
          client_workout_id?: string | null;
          completed_exercises?: number | null;
          created_at?: string | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          id?: string;
          notes?: string | null;
          started_at?: string | null;
          total_exercises?: number | null;
          workout_name: string;
        };
        Update: {
          client_id?: string;
          client_workout_id?: string | null;
          completed_exercises?: number | null;
          created_at?: string | null;
          duration_seconds?: number | null;
          ended_at?: string | null;
          id?: string;
          notes?: string | null;
          started_at?: string | null;
          total_exercises?: number | null;
          workout_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sessions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_sessions_client_workout_id_fkey";
            columns: ["client_workout_id"];
            isOneToOne: false;
            referencedRelation: "client_workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      workouts: {
        Row: {
          created_at: string | null;
          description: string | null;
          estimated_duration: number | null;
          id: string;
          muscle_groups: string[] | null;
          name: string;
          trainer_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          estimated_duration?: number | null;
          id?: string;
          muscle_groups?: string[] | null;
          name: string;
          trainer_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          estimated_duration?: number | null;
          id?: string;
          muscle_groups?: string[] | null;
          name?: string;
          trainer_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workouts_trainer_id_fkey";
            columns: ["trainer_id"];
            isOneToOne: false;
            referencedRelation: "trainers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "patient";
      appointment_status: "pending" | "confirmed" | "cancelled" | "completed";
      template_type:
        | "booking_confirmation"
        | "booking_confirmed"
        | "booking_cancelled"
        | "reminder_24h"
        | "reminder_1h"
        | "post_appointment"
        | "custom";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "patient"],
      appointment_status: ["pending", "confirmed", "cancelled", "completed"],
      template_type: [
        "booking_confirmation",
        "booking_confirmed",
        "booking_cancelled",
        "reminder_24h",
        "reminder_1h",
        "post_appointment",
        "custom",
      ],
    },
  },
} as const;
