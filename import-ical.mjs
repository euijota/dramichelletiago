import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://whhzthplrygtpmmtwsuz.supabase.co";
const SUPABASE_KEY = "sb_publishable_rWLb27n1oPf6G0hGzi2nTA_OZtVF7Qb";
const ICAL_URL =
  "https://calendar.google.com/calendar/ical/dramichellebarbosatiago%40gmail.com/private-01e577e4ac71421318a056fcd50dd223/basic.ics";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log("Baixando feed iCal do Google Calendar / Consultorio.me...");
  const res = await fetch(ICAL_URL);
  const icsData = await res.text();

  console.log("Processando eventos do iCal...");
  const blocks = icsData.split("BEGIN:VEVENT");
  let count = 0;
  let skipped = 0;

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const dtstartMatch = block.match(/DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{4,6}))?/);
    const summaryMatch = block.match(/SUMMARY:(.*)/);
    const descriptionMatch = block.match(/DESCRIPTION:(.*)/s);

    if (dtstartMatch && summaryMatch) {
      const rawDate = dtstartMatch[1]; // YYYYMMDD
      const rawTime = dtstartMatch[2]; // HHMMSS

      const year = rawDate.slice(0, 4);
      const month = rawDate.slice(4, 6);
      const day = rawDate.slice(6, 8);
      const isoDate = `${year}-${month}-${day}`;

      let timeStr = "09:00";
      if (rawTime) {
        const h = Number(rawTime.slice(0, 2));
        const m = rawTime.slice(2, 4);
        timeStr = `${String(h).padStart(2, "0")}:${m}`;
      }

      const patientName = summaryMatch[1].trim().replace(/\\,/g, ",");
      const desc = descriptionMatch ? descriptionMatch[1].trim().slice(0, 200) : "";

      const phoneMatch = desc.match(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/);
      const phone = phoneMatch ? phoneMatch[0] : "(96) 98111-1157";

      if (
        patientName &&
        !patientName.includes("Feriado") &&
        !patientName.includes("Google") &&
        !patientName.includes("Aniversário")
      ) {
        const { error } = await supabase.from("appointments").insert({
          appointment_date: isoDate,
          appointment_time: timeStr,
          patient_name: patientName,
          patient_phone: phone,
          patient_email: "consultorio.me@paciente.com",
          service_name: "Consulta (Sincronizada Consultório.me)",
          notes: `[Consultório.me / Google Agenda] ${desc.replace(/\\n/g, " ")}`,
          status: "confirmed",
        });

        if (error) {
          console.error(`Erro ao inserir ${patientName} (${isoDate}):`, error.message);
          skipped++;
        } else {
          console.log(`✓ Importado: ${patientName} - ${isoDate} às ${timeStr}`);
          count++;
        }
      }
    }
  }

  console.log(
    `\nImportação concluída! ${count} consultas cadastradas no Supabase. (${skipped} puladas/duplicadas)`,
  );
}

main().catch(console.error);
