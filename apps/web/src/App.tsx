export function App() {
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        İçeriğe geç
      </a>

      <header className="site-header">
        <div className="header-content">
          <span className="wordmark">HedefOra</span>
          <span className="preview-label">Teknik önizleme</span>
        </div>
      </header>

      <main className="main-content" id="main-content" tabIndex={-1}>
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">W000 · Temel kurulum</p>
          <h1 id="page-title">Uygulama altyapısı hazırlanıyor.</h1>
          <p className="intro-copy">
            Bu ekran yalnızca erişilebilir arayüz temelini doğrulamak için hazırlandı. Henüz
            kullanıcı işlemleri sunmuyor.
          </p>
        </section>

        <aside className="scope-card" aria-labelledby="scope-title">
          <h2 id="scope-title">Kurulum kapsamı</h2>
          <p>Bu teknik önizlemede hesap, plan veya kaynak işlemi bulunmuyor.</p>
        </aside>
      </main>

      <footer className="site-footer">
        <p>HedefOra bağımsız bir üründür; herhangi bir resmî kurumla bağlantılı değildir.</p>
      </footer>
    </div>
  );
}
