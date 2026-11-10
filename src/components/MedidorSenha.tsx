import { avaliarSenha } from '../lib/seguranca';

const ROTULOS = ['Fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];

/** Barra de força + o primeiro problema da senha, enquanto a pessoa digita. */
export function MedidorSenha({ senha, contexto }: { senha: string; contexto?: { login?: string; nome?: string; email?: string } }) {
  if (!senha) return null;
  const av = avaliarSenha(senha, contexto);
  const cor = !av.ok ? 'var(--critico)' : av.forca >= 3 ? 'var(--ok)' : 'var(--atencao)';
  return (
    <div className="medidor-senha" aria-live="polite">
      <div className="medidor-senha__barras" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ background: i < Math.max(1, av.forca) ? cor : undefined }} />
        ))}
      </div>
      <span style={{ color: cor }}>{av.ok ? `Senha ${ROTULOS[av.forca].toLowerCase()}` : av.problemas[0]}</span>
    </div>
  );
}
