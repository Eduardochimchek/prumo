// Alertas da conferência antes de pagar (boleto repetido, banco trocado, valor diferente da nota…).
// Grave = vermelho; atenção = âmbar. Sempre com título escrito, nunca só a cor.

import type { AlertaConferencia } from '../data/conferencia';
import { Icone } from './Icone';

export function AlertasConferencia({ alertas }: { alertas: AlertaConferencia[] }) {
  if (!alertas.length) return null;
  return (
    <ul className="alertas-conf" aria-label="Conferência antes de pagar">
      {alertas.map((a) => (
        <li key={a.titulo} className={`aviso-caixa aviso-caixa--${a.nivel === 'critico' ? 'critico' : 'atencao'}`}>
          <Icone nome="alerta" />
          <div>
            <strong>{a.titulo}</strong>
            <div className="alertas-conf__texto">{a.texto}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
