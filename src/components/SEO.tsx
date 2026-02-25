import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  type?: string;
  canonicalUrl?: string;
}

export default function SEO({
  title = 'Zero Nonsense - Free AI Detection Remover',
  description = 'Convert AI text to human text, bypass AI detection, remove plagiarism, and do it all with our 100% free tool.',
  type = 'website',
  canonicalUrl = 'https://paraphrase-nine.vercel.app',
}: SEOProps) {
  const defaultTitle = `${title} | Zero Nonsense - Free AI Detection Remover`;
  const defaultKeywords = "AI detection remover, humanize AI text, bypass GPTZero, free AI bypasser, remove AI plagiarism, quillbot alternative, zero nonsense ai";
  const defaultImage = "https://paraphrase-nine.vercel.app/og-image.jpg"; // Placeholder URL

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Zero Nonsense AI Humanizer",
    "applicationCategory": "UtilityApplication",
    "operatingSystem": "Web",
    "offers": [
      {
        "@type": "Offer",
        "price": "0.00",
        "priceCurrency": "USD",
        "name": "Free tier"
      },
      {
        "@type": "Offer",
        "price": "2.00",
        "priceCurrency": "USD",
        "name": "Pro tier"
      }
    ],
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "150"
    }
  };

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{defaultTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={defaultKeywords} />
      
      {/* Canonical Link */}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph (OG) Tags */}
      <meta property="og:title" content={defaultTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={defaultImage} />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={defaultTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={defaultImage} />

      {/* Structured Data (JSON-LD) */}
      <script type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </script>
    </Helmet>
  );
}
