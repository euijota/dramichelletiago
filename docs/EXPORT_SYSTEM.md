# Sistema de Exportação de Agenda

Sistema completo para exportar relatórios da agenda em PDF, Excel e CSV.

## Funcionalidades

- ✅ Exportação em 3 formatos: PDF, Excel (XLSX), CSV
- ✅ Filtros avançados: período, status, busca textual
- ✅ Interface modal intuitiva no painel administrativo
- ✅ Estatísticas agregadas (total, por status)
- ✅ Design profissional com logo e branding
- ✅ Nomes de arquivo automáticos com timestamp

## Formatos disponíveis

### PDF
- Layout profissional com logo e cores da marca
- Tabela formatada com todas as consultas
- Cabeçalho com período e estatísticas
- Rodapé com data de geração e paginação
- Biblioteca: `jspdf` + `jspdf-autotable`

### Excel (XLSX)
- Planilha principal com todos os dados
- Planilha "Resumo" com estatísticas
- Colunas com largura ajustada
- Formatação profissional
- Biblioteca: `xlsx`

### CSV
- Formato universal para importação em outros sistemas
- Compatível com Excel, Google Sheets, etc.
- Todas as colunas de dados
- Biblioteca: `xlsx` (conversão)

## Como usar

### No painel administrativo

1. Clique no botão **"📊 Exportar"** no cabeçalho
2. Escolha o formato (PDF, Excel ou CSV)
3. Configure os filtros (opcional):
   - **Período**: data início e/ou fim
   - **Status**: pendente, confirmado, cancelado, concluído
   - **Busca**: nome, telefone, email ou serviço
4. Clique em **"Exportar"**
5. Arquivo baixado automaticamente

### Filtros

**Período**
```typescript
{
  startDate: "2026-08-01", // Agendamentos a partir desta data
  endDate: "2026-08-31"    // Agendamentos até esta data
}
```

**Status** (múltipla seleção)
```typescript
{
  status: ["pending", "confirmed"] // Apenas pendentes e confirmados
}
```

**Busca textual** (case-insensitive)
```typescript
{
  searchTerm: "Maria" // Busca em nome, telefone, email, serviço
}
```

**Combinação de filtros**
```typescript
const filters = {
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  status: ["confirmed", "completed"],
  searchTerm: "Limpeza"
};
```

## Estrutura de dados

### AppointmentExport
```typescript
interface AppointmentExport {
  id: string;
  appointment_date: string;      // ISO format: YYYY-MM-DD
  appointment_time: string;      // HH:MM:SS
  patient_name: string;
  patient_phone: string;
  patient_email: string;
  service_name: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  created_at: string;            // ISO timestamp
}
```

## API

### `filterAppointments(appointments, filters)`
Aplica filtros aos agendamentos.

```typescript
import { filterAppointments } from "@/lib/export";

const filtered = filterAppointments(allAppointments, {
  startDate: "2026-08-01",
  status: ["confirmed"]
});
```

### `exportToPDF(appointments, filters)`
Exporta para PDF e inicia download.

```typescript
import { exportToPDF } from "@/lib/export";

exportToPDF(allAppointments, {
  startDate: "2026-08-01",
  endDate: "2026-08-31"
});
// Baixa: agenda_2026-08-06.pdf
```

### `exportToExcel(appointments, filters)`
Exporta para Excel (XLSX) e inicia download.

```typescript
import { exportToExcel } from "@/lib/export";

exportToExcel(allAppointments);
// Baixa: agenda_2026-08-06.xlsx
```

### `exportToCSV(appointments, filters)`
Exporta para CSV e inicia download.

```typescript
import { exportToCSV } from "@/lib/export";

exportToCSV(allAppointments);
// Baixa: agenda_2026-08-06.csv
```

## Conteúdo dos relatórios

### Colunas incluídas

**PDF**:
- Data (DD/MM/YYYY)
- Hora (HH:MM)
- Paciente
- Telefone
- Serviço
- Status

**Excel/CSV** (completo):
- Data
- Hora
- Paciente
- Telefone
- Email
- Serviço
- Status
- Observações
- Criado em

### Estatísticas (cabeçalho/planilha resumo)

- Total de agendamentos
- Confirmados
- Pendentes
- Cancelados
- Concluídos
- Período (se filtrado)

## Exemplos de uso

### Relatório mensal
```typescript
exportToPDF(allAppointments, {
  startDate: "2026-08-01",
  endDate: "2026-08-31"
});
```

### Apenas consultas confirmadas
```typescript
exportToExcel(allAppointments, {
  status: ["confirmed"]
});
```

### Buscar paciente específico
```typescript
exportToCSV(allAppointments, {
  searchTerm: "Maria Silva"
});
```

### Relatório trimestral de concluídos
```typescript
exportToPDF(allAppointments, {
  startDate: "2026-06-01",
  endDate: "2026-08-31",
  status: ["completed"]
});
```

## Personalização

### Alterar cores do PDF
Edite em `src/lib/export.ts`:

```typescript
doc.setTextColor(139, 69, 139); // RGB da cor primária
headStyles: {
  fillColor: [139, 69, 139], // Cor do cabeçalho da tabela
}
```

### Adicionar logo no PDF
```typescript
// Após criar o jsPDF:
const logo = "data:image/png;base64,..."; // Base64 da logo
doc.addImage(logo, "PNG", 14, 10, 30, 30);
```

### Customizar colunas
Modifique os arrays `tableData` em `exportToPDF()` ou os objetos de dados em `exportToExcel()`.

## Testes

79 testes passando, incluindo:
- ✅ Filtros por data (início, fim, range)
- ✅ Filtros por status (único, múltiplo)
- ✅ Busca textual (nome, telefone, email, serviço)
- ✅ Combinação de filtros
- ✅ Casos extremos (vazio, sem matches)
- ✅ Estrutura de dados

```bash
npm test
```

## Bibliotecas utilizadas

- **jspdf** (2.5.2): Geração de PDF
- **jspdf-autotable** (3.8.4): Tabelas automáticas em PDF
- **xlsx** (0.18.5): Leitura/escrita Excel e CSV

## Performance

- ✅ Filtros executam client-side (instantâneo)
- ✅ Geração de arquivos assíncrona
- ✅ Suporta milhares de registros
- ✅ Download direto (sem upload para servidor)

## Próximas melhorias

- [ ] Agendamento de relatórios automáticos (mensal/semanal)
- [ ] Envio por email
- [ ] Templates customizáveis
- [ ] Gráficos no PDF
- [ ] Exportação de prontuários (quando implementado)
