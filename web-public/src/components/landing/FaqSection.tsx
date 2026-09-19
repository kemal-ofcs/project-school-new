"use client";

import { HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { koleksiFaq } from "@/lib/services/landing-collections";

interface FaqSectionProps {
  konten?: Record<string, string>;
}

/**
 * Pertanyaan yang sering diajukan — seluruhnya dari CMS (`landing.faq_items`).
 *
 * Versi sebelumnya membawa lima tanya-jawab yang ditulis di kode, termasuk
 * janji yang sangat spesifik: beasiswa DPP hingga 100%, sertifikasi Cambridge
 * IGCSE, login wali lewat OTP WhatsApp. Semuanya tampil di situs setiap sekolah
 * seolah-olah kebijakan sekolah itu, padahal tidak ada satu pun yang bisa
 * disunting. Tanpa satu pertanyaan pun, section ini tidak dirender.
 */
export function FaqSection({ konten = {} }: FaqSectionProps) {
  const faqs = koleksiFaq(konten);
  if (faqs.length === 0) return null;

  const eyebrow = konten["landing.faq_eyebrow"];
  const title = konten["landing.faq_title"];
  const subtitle = konten["landing.faq_subtitle"];
  const adaHeader = Boolean(eyebrow || title || subtitle);

  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-12">
        {adaHeader ? (
          <div className="text-center space-y-3">
            {eyebrow ? (
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-secondary">
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{eyebrow}</span>
              </div>
            ) : null}
            {title ? (
              <h2 className="font-bold text-2xl sm:text-4xl text-foreground tracking-tight">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* `value` berbasis posisi: pertanyaan boleh kembar dan boleh digeser
            urutannya di CMS, jadi tidak ada nilai lain yang stabil. */}
        <Accordion type="single" defaultValue="faq-0" className="w-full">
          {faqs.map((faq, i) => (
            <AccordionItem key={`faq-${i}-${faq.q}`} value={`faq-${i}`}>
              <AccordionTrigger>{faq.q}</AccordionTrigger>
              {faq.a ? <AccordionContent>{faq.a}</AccordionContent> : null}
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
