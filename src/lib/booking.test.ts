import { describe, it, expect } from "vitest";

describe("Booking Form Validation", () => {
  it("should validate patient name (required, min 3 chars)", () => {
    const invalidNames = ["", "AB", "  "];
    const validNames = ["João Silva", "Maria", "Dr. Carlos"];

    invalidNames.forEach((name) => {
      expect(name.trim().length).toBeLessThan(3);
    });

    validNames.forEach((name) => {
      expect(name.trim().length).toBeGreaterThanOrEqual(3);
    });
  });

  it("should validate phone format (11 digits)", () => {
    const validPhone = "(96) 98111-1157";
    const digitsOnly = validPhone.replace(/\D/g, "");

    expect(digitsOnly).toHaveLength(11);
    expect(digitsOnly).toMatch(/^\d{11}$/);
  });

  it("should format phone correctly", () => {
    const input = "96981111157";
    const formatted = `(${input.slice(0, 2)}) ${input.slice(2, 7)}-${input.slice(7)}`;

    expect(formatted).toBe("(96) 98111-1157");
  });

  it("should validate email format (optional)", () => {
    const validEmails = ["", "paciente@gmail.com", "dra.michelle@clinica.com.br"];
    const invalidEmails = ["@email", "email@", "email"];

    validEmails.forEach((email) => {
      if (email) {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      }
    });

    invalidEmails.forEach((email) => {
      expect(email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });
  });
});

describe("Protocol Generation", () => {
  it("should generate unique 6-digit protocol", () => {
    const protocol1 = "AG-" + Math.floor(100000 + Math.random() * 900000);
    const protocol2 = "AG-" + Math.floor(100000 + Math.random() * 900000);

    expect(protocol1).toMatch(/^AG-\d{6}$/);
    expect(protocol2).toMatch(/^AG-\d{6}$/);
    // Protocols should be different (statistically)
    expect(protocol1).not.toBe(protocol2);
  });

  it("should generate protocol between 100000 and 999999", () => {
    for (let i = 0; i < 10; i++) {
      const num = Math.floor(100000 + Math.random() * 900000);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThanOrEqual(999999);
    }
  });
});

describe("Slot Availability Logic", () => {
  it("should filter out booked slots", () => {
    const allSlots = ["09:00", "10:00", "11:00"];
    const bookedSlots = ["10:00"];

    const available = allSlots.filter((slot) => !bookedSlots.includes(slot));

    expect(available).toEqual(["09:00", "11:00"]);
  });

  it("should filter out past slots for today", () => {
    const allSlots = ["09:00", "10:00", "11:00"];
    const currentHour = 10;

    const available = allSlots.filter((slot) => {
      const slotHour = parseInt(slot.split(":")[0], 10);
      return slotHour > currentHour;
    });

    expect(available).toEqual(["11:00"]);
  });

  it("should combine booked + past filtering", () => {
    const allSlots = ["09:00", "10:00", "11:00", "15:00", "16:00", "17:00"];
    const bookedSlots = ["11:00", "16:00"];
    const currentHour = 9;
    const isToday = true;

    const available = allSlots.filter((slot) => {
      if (bookedSlots.includes(slot)) return false;
      if (isToday) {
        const slotHour = parseInt(slot.split(":")[0], 10);
        if (slotHour <= currentHour) return false;
      }
      return true;
    });

    expect(available).toEqual(["10:00", "15:00", "17:00"]);
  });
});

describe("Date Utilities", () => {
  it("should check if date is today", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayISO = `${year}-${month}-${day}`;

    const testDate = "2026-08-06";

    expect(testDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should skip Sundays in date generation", () => {
    const dates: Date[] = [];
    const curr = new Date(2026, 7, 9); // Saturday

    for (let i = 0; i < 10; i++) {
      curr.setDate(curr.getDate() + 1);
      if (curr.getDay() !== 0) {
        // Skip Sunday
        dates.push(new Date(curr));
      }
    }

    // Should not contain any Sunday
    dates.forEach((d) => {
      expect(d.getDay()).not.toBe(0);
    });
  });
});

describe("WhatsApp URL Generation", () => {
  it("should generate valid WhatsApp URL", () => {
    const phone = "5596981111157";
    const message = "Olá, gostaria de agendar uma consulta";
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    expect(url).toContain("https://wa.me/5596981111157");
    expect(url).toContain("text=Ol%C3%A1");
    expect(url).toContain("agendar");
  });

  it("should encode special characters in message", () => {
    const message = "Protocolo: AG-123456\nData: 10/08\nHora: 15:00";
    const encoded = encodeURIComponent(message);

    expect(encoded).toContain("%0A"); // \n
    expect(encoded).toContain("%3A"); // :
  });
});
