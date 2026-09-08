import { setRequestLocale } from 'next-intl/server';
import { ResultsPage } from '@/components/results-page';

export default async function Results({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ResultsPage />;
}
