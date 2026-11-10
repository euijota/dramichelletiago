import React, { useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_ANAMNESIS_ANSWERS,
  SYSTEMIC_CONDITIONS_OPTIONS,
  type AnamnesisAnswers,
} from "@/lib/anamnesis";
import { submitPatientAnamnesis } from "@/lib/anamnesis-server";
import {
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Heart,
  Smile,
  ShieldCheck,
  Send,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PatientAnamnesisFormProps {
  token?: string | null;
  patientId?: string | null;
  appointmentId?: string | null;
  protocol?: string | null;
  patientName?: string | null;
  patientPhone?: string | null;
  patientEmail?: string | null;
  defaultReason?: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  inline?: boolean;
}

export function PatientAnamnesisForm({
  token,
  patientId,
  appointmentId,
  protocol,
  patientName,
  patientPhone,
  patientEmail,
  defaultReason,
  onSuccess,
  onCancel,
  inline = false,
}: PatientAnamnesisFormProps) {
  const [form, setForm] = useState<AnamnesisAnswers>(() => ({
    ...DEFAULT_ANAMNESIS_ANSWERS,
    reasonForVisit: defaultReason || "",
  }));

  const [contactName, setContactName] = useState(patientName || "");
  const [contactPhone, setContactPhone] = useState(patientPhone || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // Helper para atualizar campos simples
  const updateField = <K extends keyof AnamnesisAnswers>(key: K, value: AnamnesisAnswers[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Helper para alternar condições sistêmicas
  const toggleSystemic = (condition: string) => {
    setForm((prev) => {
      const exists = prev.systemicConditions.includes(condition);
      return {
        ...prev,
        systemicConditions: exists
          ? prev.systemicConditions.filter((c) => c !== condition)
          : [...prev.systemicConditions, condition],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!patientId && !contactName.trim()) {
      toast.error("Por favor, preencha seu nome completo.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitPatientAnamnesis({
        data: {
          token: token || undefined,
          patientId: patientId || undefined,
          appointmentId: appointmentId || undefined,
          protocol: protocol || undefined,
          patientName: contactName.trim() || undefined,
          patientPhone: contactPhone.trim() || undefined,
          patientEmail: patientEmail || undefined,
          answers: form,
        },
      });

      if (result.success) {
        setIsDone(true);
        toast.success("Ficha de anamnese salva com sucesso!");
        if (onSuccess) onSuccess();
      } else {
        throw new Error("Não foi possível salvar o formulário.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[PatientAnamnesisForm] Submit error:", msg);
      toast.error("Erro ao enviar a ficha. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDone) {
    return (
      <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-4">
        <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h3 className="font-display text-2xl font-bold text-foreground">
          Ficha Pré-Atendimento Concluída!
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          A Dra. Michelle Tiago já recebeu suas informações clínicas e histórico médico no
          prontuário digital. Muito obrigado pela sua colaboração!
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-4 px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary-deep transition-all cursor-pointer"
          >
            Fechar
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-left">
      {/* Banner Informativo */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
        <ClipboardList className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs">
          <p className="font-bold text-foreground">
            Questionário Oficial de Pré-Atendimento (Anamnese)
          </p>
          <p className="text-muted-foreground mt-0.5">
            Leva apenas 2 minutos. Suas respostas são sigilosas e fundamentais para planejar sua
            consulta com conforto e total segurança biológica.
          </p>
        </div>
      </div>

      {/* Identificação caso não venha de agendamento logado */}
      {!patientId && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" /> Seus Dados de Identificação
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-semibold text-foreground block mb-1">Nome Completo *</label>
              <input
                type="text"
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Seu nome"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1">
                WhatsApp / Telefone
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(96) 98140-7223"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>
      )}

      {/* BLOCO 1: Consulta & Sorriso */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
          <Smile className="h-4 w-4" /> 1. Motivo da Consulta & Histórico Odontológico
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-foreground block mb-1">
              1. Qual o motivo principal da sua consulta?
            </label>
            <input
              type="text"
              value={form.reasonForVisit}
              onChange={(e) => updateField("reasonForVisit", e.target.value)}
              placeholder="Ex: Avaliação, dor, limpeza, dente quebrado, estética..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              2. Quando foi sua última consulta com dentista?
            </label>
            <input
              type="text"
              value={form.lastDentalTreatment}
              onChange={(e) => updateField("lastDentalTreatment", e.target.value)}
              placeholder="Ex: Menos de 6 meses, há 1 ano, mais de 2 anos..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="font-semibold text-foreground block mb-1">
              3. Há algo que lhe incomoda no seu sorriso?
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                {(["Não", "Sim"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("smileComplaint", opt)}
                    className={cn(
                      "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                      form.smileComplaint === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {form.smileComplaint === "Sim" && (
                <input
                  type="text"
                  value={form.smileComplaintDetails}
                  onChange={(e) => updateField("smileComplaintDetails", e.target.value)}
                  placeholder="O que você gostaria de melhorar? (Ex: Cor amarelada, espaço, formato)"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              4. Já realizou tratamento ortodôntico (usou aparelho)?
            </label>
            <div className="flex gap-2">
              {(["Não", "Sim"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField("previousOrthodontics", opt)}
                  className={cn(
                    "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                    form.previousOrthodontics === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BLOCO 2: Alergias & Cuidados Especiais (Crítico) */}
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.02] p-5 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> 2. Alergias & Cuidados Clínicos Importantes
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-foreground block mb-1">
              5. Tem alergia a algum medicamento? *
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                {(["Não", "Sim"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("drugAllergy", opt)}
                    className={cn(
                      "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                      form.drugAllergy === opt
                        ? opt === "Sim"
                          ? "bg-rose-600 text-white border-rose-600"
                          : "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {form.drugAllergy === "Sim" && (
                <input
                  type="text"
                  required
                  value={form.drugAllergyDetails}
                  onChange={(e) => updateField("drugAllergyDetails", e.target.value)}
                  placeholder="Qual medicamento? (Ex: Dipirona, Penicilina)"
                  className="flex-1 rounded-xl border border-rose-300 bg-rose-50/50 dark:bg-rose-950/20 px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                />
              )}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              6. Teve alguma reação à anestesia local de dentista?
            </label>
            <div className="flex gap-2">
              {(["Não", "Sim"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField("localAnesthesiaReaction", opt)}
                  className={cn(
                    "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                    form.localAnesthesiaReaction === opt
                      ? opt === "Sim"
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              7. Tem reação alérgica a algum alimento?
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                {(["Não", "Sim"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("foodAllergy", opt)}
                    className={cn(
                      "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                      form.foodAllergy === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {form.foodAllergy === "Sim" && (
                <input
                  type="text"
                  value={form.foodAllergyDetails}
                  onChange={(e) => updateField("foodAllergyDetails", e.target.value)}
                  placeholder="Qual alimento?"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              8. Quando você se corta, sangra muito ou demora a parar?
            </label>
            <div className="flex gap-2">
              {(["Não", "Sim"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField("excessiveBleeding", opt)}
                  className={cn(
                    "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                    form.excessiveBleeding === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="font-semibold text-foreground block mb-1">
              9. Já teve desmaios, crises nervosas, epilepsia ou convulsão?
            </label>
            <div className="flex gap-2">
              {(["Não", "Sim"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField("faintingOrEpilepsy", opt)}
                  className={cn(
                    "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                    form.faintingOrEpilepsy === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* BLOCO 3: Saúde Geral & Medicamentos */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
          <Heart className="h-4 w-4" /> 3. Saúde Geral & Tratamento Médico
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-foreground block mb-1">
              10. Está fazendo algum tratamento médico atualmente?
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                {(["Não", "Sim"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("medicalTreatment", opt)}
                    className={cn(
                      "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                      form.medicalTreatment === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {form.medicalTreatment === "Sim" && (
                <input
                  type="text"
                  value={form.medicalTreatmentDetails}
                  onChange={(e) => updateField("medicalTreatmentDetails", e.target.value)}
                  placeholder="Qual tratamento médico?"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              11. Toma algum medicamento de uso contínuo ou frequente?
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                {(["Não", "Sim"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("takingMedication", opt)}
                    className={cn(
                      "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                      form.takingMedication === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {form.takingMedication === "Sim" && (
                <input
                  type="text"
                  value={form.continuousMeds}
                  onChange={(e) => updateField("continuousMeds", e.target.value)}
                  placeholder="Quais remédios?"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              12. Sua pressão arterial costuma ser normal?
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateField("normalBloodPressure", "Sim")}
                className={cn(
                  "flex-1 py-2 rounded-xl border font-semibold transition-all cursor-pointer text-center",
                  form.normalBloodPressure === "Sim"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted",
                )}
              >
                Sim (Normal)
              </button>
              <button
                type="button"
                onClick={() => updateField("normalBloodPressure", "Não")}
                className={cn(
                  "flex-1 py-2 rounded-xl border font-semibold transition-all cursor-pointer text-center",
                  form.normalBloodPressure === "Não"
                    ? "bg-rose-600 text-white border-rose-600"
                    : "bg-background text-muted-foreground border-border hover:bg-muted",
                )}
              >
                Não (Pressão Alta / Baixa)
              </button>
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              13. Para mulheres: Está grávida no momento?
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                {(["Não", "Sim"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("pregnant", opt)}
                    className={cn(
                      "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                      form.pregnant === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {form.pregnant === "Sim" && (
                <input
                  type="text"
                  value={form.pregnantMonth}
                  onChange={(e) => updateField("pregnantMonth", e.target.value)}
                  placeholder="Qual mês ou trimestre?"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* BLOCO 4: Saúde Bucal & Sintomas */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> 4. Saúde Bucal, Gengiva & Hábitos
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-foreground block mb-1">
              14. Sua gengiva sangra com facilidade (ao escovar ou passar fio)?
            </label>
            <div className="flex gap-2">
              {(["Não", "Às vezes", "Sim"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField("bleedingGums", opt)}
                  className={cn(
                    "flex-1 py-2 rounded-xl border font-semibold transition-all cursor-pointer text-center",
                    form.bleedingGums === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              15. Sente sensibilidade nos dentes (frio, quente, doce)?
            </label>
            <div className="flex gap-2">
              {(["Não", "Sim"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField("sensitivity", opt)}
                  className={cn(
                    "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                    form.sensitivity === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              16. Costuma ranger ou apertar os dentes (ao dormir ou no estresse)?
            </label>
            <div className="flex gap-2">
              {(["Não", "Sim"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField("bruxism", opt)}
                  className={cn(
                    "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                    form.bruxism === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              17. Sente dores de cabeça, face, ouvido ou estalos no maxilar?
            </label>
            <div className="flex gap-2">
              {(["Não", "Sim"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateField("facialOrTmjPain", opt)}
                  className={cn(
                    "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                    form.facialOrTmjPain === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              18. Tem hábito de roer unhas ou morder objetos/canetas?
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                {(["Não", "Sim"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("habits", opt)}
                    className={cn(
                      "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                      form.habits === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {form.habits === "Sim" && (
                <input
                  type="text"
                  value={form.habitsDetails}
                  onChange={(e) => updateField("habitsDetails", e.target.value)}
                  placeholder="Qual hábito?"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              19. É fumante (cigarros, palheiro, vape)?
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex gap-2">
                {(["Não", "Sim"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("smoking", opt)}
                    className={cn(
                      "min-w-20 py-2 rounded-xl border font-semibold transition-all cursor-pointer",
                      form.smoking === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {form.smoking === "Sim" && (
                <input
                  type="text"
                  value={form.smokingDetails}
                  onChange={(e) => updateField("smokingDetails", e.target.value)}
                  placeholder="Frequência / quantidade por dia"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* BLOCO 5: Condições Sistêmicas & Observações */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> 5. Condições de Saúde & Observações Finais
        </h4>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-foreground block mb-2">
              20. Marque se você possui alguma das condições abaixo:
            </label>
            <div className="flex flex-wrap gap-2">
              {SYSTEMIC_CONDITIONS_OPTIONS.map((cond) => {
                const isSelected = form.systemicConditions.includes(cond);
                return (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => toggleSystemic(cond)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer",
                      isSelected
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-700 shadow-xs"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    {cond}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">
              Observações ou algo importante que a Dra. Michelle precisa saber:
            </label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Ex: Medo de agulha, preferência de horário, histórico cirúrgico..."
              className="w-full rounded-xl border border-border bg-background p-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-3 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Pular por agora
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-full bg-primary hover:bg-primary-deep text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Gravando no Prontuário...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span>Enviar Ficha Pré-Atendimento</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
