"use client";

import { HelpCircle, Search, X } from "lucide-react";
import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { koleksiFaq } from "@/lib/services/landing-collections";

interface FaqSectionProps {
  konten?: Record<string, string>;
}

export function FaqSection({ konten = {} }: FaqSectionProps) {
  const [kataKunci, setKataKunci] = React.useState("");

  const faqs = React.useMemo(() => koleksiFaq(konten), [konten]);
  if (faqs.length === 0) return null;

  const eyebrow = konten["landing.faq_eyebrow"];
  const title = konten["landing.faq_title"];
  const subtitle = konten["landing.faq_subtitle"];
  const adaHeader = Boolean(eyebrow || title || subtitle);

  const faqsTerfilter = faqs.filter((f) => {
    const q = kataKunci.trim().toLowerCase();
    if (!q) return true;
    return f.q.toLowerCase().includes(q) || f.a?.toLowerCase().includes(q);
  });

  return (
    <section className="py-20 sm:py-28 bg-background">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-10">
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

        {/* Pencarian FAQ */}
        {faqs.length > 3 ? (
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={kataKunci}
              onChange={(e) => setKataKunci(e.target.value)}
              placeholder="Cari pertanyaan umum atau kata kunci..."
              aria-label="Cari pertanyaan FAQ"
              className="w-full h-11 pl-10 pr-9 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
            />
            {kataKunci ? (
              <button
                type="button"
                onClick={() => setKataKunci("")}
                aria-label="Hapus pencarian FAQ"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        {faqsTerfilter.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-3 bg-card max-w-lg mx-auto">
            <p className="text-sm text-muted-foreground">
              Tidak ada pertanyaan yang sesuai dengan kata kunci &quot;
              {kataKunci}&quot;.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setKataKunci("")}
            >
              Reset Pencarian
            </Button>
          </div>
        ) : (
          <Accordion
            type="single"
            defaultValue={`faq-0`}
            key={kataKunci}
            className="w-full"
          >
            {faqsTerfilter.map((faq, i) => (
              <AccordionItem key={`faq-${i}-${faq.q}`} value={`faq-${i}`}>
                <AccordionTrigger className="text-left font-semibold hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                {faq.a ? (
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                ) : null}
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </section>
  );
}
