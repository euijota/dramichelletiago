import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { MessageTemplate, TemplateType } from "@/lib/message-templates";

const messageTemplateSchema = z.object({
  type: z.enum([
    "booking_confirmation",
    "booking_confirmed", 
    "booking_cancelled",
    "reminder_24h",
    "reminder_1h",
    "post_appointment",
    "custom"
  ]),
  name: z.string().min(1).max(100),
  channel: z.enum(["whatsapp", "email", "both"]),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
  is_active: z.boolean().default(true),
});

export const listMessageTemplates = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("message_templates")
      .select("*")
      .order("type")
      .order("is_default", { ascending: false });

    if (error) throw new Error(error.message);
    return data as MessageTemplate[];
  });

export const getMessageTemplate = createServerFn({ method: "GET" })
  .validator((type: TemplateType) => z.string().parse(type))
  .handler(async ({ data: type }) => {
    const { data, error } = await supabaseAdmin
      .from("message_templates")
      .select("*")
      .eq("type", type)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as MessageTemplate | null;
  });

export const createMessageTemplate = createServerFn({ method: "POST" })
  .validator(messageTemplateSchema)
  .handler(async ({ data }) => {
    // If setting as default, unset other defaults for this type
    if (data.is_active) {
      await supabaseAdmin
        .from("message_templates")
        .update({ is_default: false })
        .eq("type", data.type);
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("message_templates")
      .insert({
        ...data,
        is_default: data.is_active, // First active becomes default
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return inserted as MessageTemplate;
  });

export const updateMessageTemplate = createServerFn({ method: "POST" })
  .validator(z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    channel: z.enum(["whatsapp", "email", "both"]).optional(),
    subject: z.string().max(200).optional(),
    body: z.string().min(1).max(5000).optional(),
    is_active: z.boolean().optional(),
    is_default: z.boolean().optional(),
  }))
  .handler(async ({ data }) => {
    const { id, is_default, is_active, ...updates } = data;

    // If setting as default, unset other defaults for this type
    if (is_default) {
      const { data: current } = await supabaseAdmin
        .from("message_templates")
        .select("type")
        .eq("id", id)
        .single();
      
      if (current) {
        await supabaseAdmin
          .from("message_templates")
          .update({ is_default: false })
          .eq("type", current.type)
          .neq("id", id);
      }
    }

    // If deactivating a default, activate another
    if (is_active === false) {
      const { data: current } = await supabaseAdmin
        .from("message_templates")
        .select("type, is_default")
        .eq("id", id)
        .single();
      
      if (current?.is_default) {
        await supabaseAdmin
          .from("message_templates")
          .update({ is_default: true })
          .eq("type", current.type)
          .neq("id", id)
          .eq("is_active", true)
          .limit(1);
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from("message_templates")
      .update({
        ...updates,
        ...(is_default !== undefined && { is_default }),
        ...(is_active !== undefined && { is_active }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return updated as MessageTemplate;
  });

export const deleteMessageTemplate = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { data: current } = await supabaseAdmin
      .from("message_templates")
      .select("type, is_default")
      .eq("id", data.id)
      .single();

    const { error } = await supabaseAdmin
      .from("message_templates")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    // If deleted was default, promote another
    if (current?.is_default) {
      await supabaseAdmin
        .from("message_templates")
        .update({ is_default: true })
        .eq("type", current.type)
        .eq("is_active", true)
        .order("created_at")
        .limit(1);
    }

    return { success: true };
  });

export const initializeDefaultTemplates = createServerFn({ method: "POST" })
  .handler(async () => {
    const { DEFAULT_TEMPLATES } = await import("@/lib/message-templates");
    
    for (const tmpl of DEFAULT_TEMPLATES) {
      const { data: existing } = await supabaseAdmin
        .from("message_templates")
        .select("id")
        .eq("type", tmpl.type)
        .eq("is_default", true)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin
          .from("message_templates")
          .insert({
            ...tmpl,
            is_default: true,
          });
      }
    }

    return { success: true, count: DEFAULT_TEMPLATES.length };
  });