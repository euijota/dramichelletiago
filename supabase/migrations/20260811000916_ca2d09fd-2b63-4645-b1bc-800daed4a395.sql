-- Create message_templates table
CREATE TYPE public.template_type AS ENUM (
  'booking_confirmation',
  'booking_confirmed',
  'booking_cancelled',
  'reminder_24h',
  'reminder_1h',
  'post_appointment',
  'custom'
);

CREATE TABLE public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.template_type NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'both')),
  subject TEXT,
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
GRANT SELECT ON public.message_templates TO anon;

-- Enable RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage message templates"
ON public.message_templates
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read active templates"
ON public.message_templates
FOR SELECT
TO anon
USING (is_active = true);