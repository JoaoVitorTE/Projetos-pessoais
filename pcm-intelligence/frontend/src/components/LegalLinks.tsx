export function LegalLinks({
  cookieNotice = false,
}: {
  cookieNotice?: boolean;
}) {
  return (
    <footer className="legal-links">
      {cookieNotice && (
        <p>O PCM usa um cookie essencial para manter sua sessão.</p>
      )}
      <nav aria-label="Privacidade e termos">
        <a href="/docs/privacidade.html#privacidade">Privacidade</a>
        <a href="/docs/privacidade.html#termos">Termos de uso</a>
        <a href="/docs/privacidade.html#cookies">Cookies</a>
      </nav>
    </footer>
  );
}
