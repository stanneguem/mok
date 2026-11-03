export default function Settings({theme,onThemeChange}) {
  return <section className="workspace-page">
    <header className="page-heading"><div><span className="eyebrow">CONFIGURATION</span><h1>Paramètres</h1><p>Personnalise l’affichage et les préférences de ton espace MOK.</p></div></header>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">APPARENCE</span><h2>Thème de l’application</h2><p>Choisis l’apparence qui sera conservée sur cet appareil.</p></div></div>
      <div className="dashboard-shortcuts">
        <button type="button" className={'dashboard-shortcut '+(theme==='light'?'active':'')} aria-pressed={theme==='light'} onClick={()=>onThemeChange('light')}><span className="dashboard-shortcut-icon">☀</span><span><strong>Mode jour</strong><small>Interface claire</small></span>{theme==='light'&&<strong>✓</strong>}</button>
        <button type="button" className={'dashboard-shortcut '+(theme==='dark'?'active':'')} aria-pressed={theme==='dark'} onClick={()=>onThemeChange('dark')}><span className="dashboard-shortcut-icon">☾</span><span><strong>Mode nuit</strong><small>Interface sombre</small></span>{theme==='dark'&&<strong>✓</strong>}</button>
      </div>
    </section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">INFORMATIONS</span><h2>À propos de MOK</h2><p>Gestion locative, suivi des compteurs, facturation et encaissements.</p></div></div><p className="summary-foot">Les réglages de thème sont enregistrés automatiquement sur cet appareil.</p></section>
  </section>
}
