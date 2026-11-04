import { BrandMark } from "@/components/brand-mark";

const highlights = [
  {
    number: "01",
    title: "Conversas no lugar certo",
    description: "Organize assuntos por canais e mantenha o contexto por perto.",
  },
  {
    number: "02",
    title: "Equipes conectadas",
    description: "Reúna pessoas e espaços de trabalho em uma experiência única.",
  },
  {
    number: "03",
    title: "Feito para colaborar",
    description: "Uma base simples para transformar comunicação em colaboração.",
  },
];

export default function Home() {
  return (
    <main className="landing">
      <div className="landing__glow landing__glow--one" aria-hidden="true" />
      <div className="landing__glow landing__glow--two" aria-hidden="true" />

      <header className="topbar">
        <a className="topbar__brand" href="/" aria-label="Connexa — início">
          <BrandMark />
        </a>
        <span className="topbar__status">
          <span className="status-dot" aria-hidden="true" />
          Um novo jeito de trabalhar em equipe
        </span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          <p className="eyebrow">
            <span className="eyebrow__line" aria-hidden="true" />
            Comunicação que aproxima
          </p>
          <h1 id="hero-title">
            Boas ideias
            <br />
            acontecem <span>em conexão.</span>
          </h1>
          <p className="hero__description">
            Um espaço para conversas, equipes e colaboração. Tudo conectado
            para o trabalho fluir melhor.
          </p>
          <div className="hero__actions">
            <span className="coming-soon">
              <span className="status-dot" aria-hidden="true" />
              Estamos preparando o Connexa
            </span>
          </div>
        </div>

        <div className="preview" aria-label="Prévia ilustrativa do espaço de trabalho Connexa">
          <div className="preview__top">
            <div className="window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span>seu espaço de trabalho</span>
            <span className="preview__lock" aria-label="Prévia demonstrativa">✳</span>
          </div>
          <div className="preview__body">
            <aside className="preview__sidebar" aria-hidden="true">
              <div className="preview__workspace">C</div>
              <div className="preview__rail preview__rail--active" />
              <div className="preview__rail" />
              <div className="preview__rail" />
              <div className="preview__rail preview__rail--small" />
            </aside>
            <div className="preview__content" aria-hidden="true">
              <div className="preview__heading">
                <div>
                  <span className="preview__kicker">CANAL DE EQUIPE</span>
                  <strong># geral</strong>
                </div>
                <span className="preview__members">● ● ● <b>+8</b></span>
              </div>
              <div className="message message--first">
                <span className="avatar avatar--mint">A</span>
                <div className="message__text">
                  <div><b>Ana Costa</b><small>09:41</small></div>
                  <span>Bom dia, pessoal! Vamos tirar as ideias do papel? ✨</span>
                </div>
              </div>
              <div className="message">
                <span className="avatar avatar--violet">M</span>
                <div className="message__text">
                  <div><b>Marcos Lima</b><small>09:43</small></div>
                  <span>Por aqui, tudo pronto. Vamos nessa!</span>
                </div>
              </div>
              <div className="message">
                <span className="avatar avatar--orange">J</span>
                <div className="message__text">
                  <div><b>Julia Alves</b><small>09:45</small></div>
                  <span>Já deixei os próximos passos organizados.</span>
                </div>
              </div>
              <div className="preview__composer">
                <span>Envie uma mensagem para #geral...</span>
                <span className="preview__send">↗</span>
              </div>
            </div>
          </div>
          <div className="preview__caption">
            <span className="caption-orbit" aria-hidden="true">✳</span>
            <span>Um só lugar. Muitas possibilidades.</span>
          </div>
        </div>
      </section>

      <section className="highlights" aria-label="Princípios do Connexa">
        {highlights.map((item) => (
          <article className="highlight" key={item.number}>
            <span className="highlight__number">{item.number}</span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </div>
          </article>
        ))}
      </section>

      <footer className="footer">
        <BrandMark compact />
        <span>CONNEXA3 · Conectando pessoas e possibilidades.</span>
        <span className="footer__version">PRÉVIA INICIAL</span>
      </footer>
    </main>
  );
}
