/**
 * Utilitários e regras de negócio para o CRC (Central de Relacionamento com o Paciente)
 * Consultório Dra. Michelle Barbosa Tiago
 */

/**
 * Normaliza e gera link universal do WhatsApp compatível tanto com dispositivos móveis (app nativo)
 * quanto desktop (WhatsApp Web / aplicativo desktop).
 */
export function buildWhatsAppUniversalUrl(
  phone: string | null | undefined,
  message?: string,
): string {
  if (!phone) return "#";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "#";

  // Se já tiver DDI 55 com 12 ou 13 dígitos, preserva; caso contrário, prefixa com 55 (Brasil)
  const num =
    digits.length > 11 && digits.startsWith("55")
      ? digits
      : digits.length >= 10
        ? `55${digits}`
        : digits;

  return message
    ? `https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?phone=${num}`;
}

/**
 * Converte com segurança strings de data em dia, mês e ano,
 * suportando tanto formato ISO (YYYY-MM-DD / YYYY-MM-DDTHH:mm:ss) quanto brasileiro (DD/MM/YYYY).
 */
export function parseDateSafe(
  dateStr: string | null | undefined,
): { year: number; month: number; day: number } | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Formato ISO: YYYY-MM-DD...
  if (trimmed.includes("-")) {
    const clean = trimmed.split("T")[0];
    const parts = clean.split("-");
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (
        !isNaN(year) &&
        !isNaN(month) &&
        !isNaN(day) &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31
      ) {
        return { year, month, day };
      }
    }
  }

  // Formato BR: DD/MM/YYYY...
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (
        !isNaN(year) &&
        !isNaN(month) &&
        !isNaN(day) &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31
      ) {
        return { year, month, day };
      }
    }
  }

  return null;
}

/**
 * Verifica se a data de nascimento coincide com o mês informado (1 a 12).
 */
export function isBirthdayInMonth(
  birthDate: string | null | undefined,
  targetMonth: number,
): boolean {
  const parsed = parseDateSafe(birthDate);
  if (!parsed) return false;
  return parsed.month === targetMonth;
}

/**
 * Calcula a idade atingida no ano ou na data de referência.
 */
export function calculateAge(
  birthDate: string | null | undefined,
  referenceDate: Date = new Date(),
): number | null {
  const parsed = parseDateSafe(birthDate);
  if (!parsed) return null;

  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();

  let age = currentYear - parsed.year;
  if (currentMonth < parsed.month || (currentMonth === parsed.month && currentDay < parsed.day)) {
    age--;
  }

  return age >= 0 ? age : null;
}

/**
 * Classifica a urgência e o período de um alerta de retorno odontológico.
 */
export function classifyReturnAlert(
  dateStr: string | null | undefined,
  referenceDate: Date = new Date(),
): "vencido" | "mes_atual" | "futuro" | "sem_data" {
  const parsed = parseDateSafe(dateStr);
  if (!parsed) return "sem_data";

  const targetDate = new Date(parsed.year, parsed.month - 1, parsed.day);
  const ref = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );

  // Se a data já passou (estritamente menor que hoje)
  if (targetDate.getTime() < ref.getTime()) {
    return "vencido";
  }

  // Se está dentro do mesmo mês e ano
  if (parsed.year === ref.getFullYear() && parsed.month === ref.getMonth() + 1) {
    return "mes_atual";
  }

  // Se é futuro (próximos meses/anos)
  return "futuro";
}

/**
 * Classifica o momento de uma consulta pendente em relação à data atual.
 */
export function classifyAppointmentTiming(
  dateStr: string,
  referenceDate: Date = new Date(),
): "passado" | "hoje" | "amanha" | "futuro" {
  const parsed = parseDateSafe(dateStr);
  if (!parsed) return "futuro";

  const apptDate = new Date(parsed.year, parsed.month - 1, parsed.day);
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );

  const diffTime = apptDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "passado";
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "amanha";
  return "futuro";
}

/**
 * Interpreta informações de status e valor a partir do título e conteúdo de um orçamento clínico.
 */
export function parseOrcamentoInfo(
  title: string | null | undefined,
  content: string | null | undefined,
): { status: "pendente" | "aprovado" | "recusado"; amount: string | null } {
  const text = `${title || ""} ${content || ""}`.toLowerCase();

  let status: "pendente" | "aprovado" | "recusado" = "pendente";
  if (text.includes("aprovado") || text.includes("concluído") || text.includes("fechado")) {
    status = "aprovado";
  } else if (
    text.includes("recusado") ||
    text.includes("rejeitado") ||
    text.includes("cancelado")
  ) {
    status = "recusado";
  }

  // Tenta extrair valor no padrão: "R$ 1.500,00" ou "Valor: R$ 800"
  let amount: string | null = null;
  const match = text.match(/r\$\s*([\d.,]+)/i);
  if (match && match[1]) {
    amount = `R$ ${match[1].trim()}`;
  }

  return { status, amount };
}
