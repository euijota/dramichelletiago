import { CLINIC } from "@/lib/clinic";

const BASE_URL = "https://dramichelletiago.com.br";

export function generateDentistSchema(baseUrl: string = BASE_URL) {
  return {
    "@context": "https://schema.org",
    "@type": "Dentist",
    name: CLINIC.name,
    image: `${baseUrl}/assets/dra-michelle.jpg`,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Travessa Joaquim Pinheiro Borges, 964",
      addressLocality: "Macapá",
      addressRegion: "AP",
      postalCode: "68900-000",
      addressCountry: "BR",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: -0.037,
      longitude: -51.07,
    },
    telephone: "+5596981111157",
    url: baseUrl,
    priceRange: "$$",
    openingHours: [
      "Mo 15:00-18:00",
      "Tu 15:00-18:00",
      "We 09:00-12:00",
      "Th 15:00-18:00",
      "Fr 09:00-12:00",
      "Sa 09:00-12:00",
    ],
    medicalSpecialty: ["CosmeticDentistry"],
  };
}

export function SchemaOrgJsonLd({ baseUrl = BASE_URL }: { baseUrl?: string }) {
  const schema = generateDentistSchema(baseUrl);
  
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}