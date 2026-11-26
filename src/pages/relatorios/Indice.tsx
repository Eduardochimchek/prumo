// Relatórios: a pessoa escolhe qual quer tirar. Dentro de um módulo (?m=financeiro) aparecem só
// os relatórios dele; sem módulo, todos os módulos que a pessoa tem. Cada linha já mostra o
// número principal, para não precisar abrir o relatório só para ver o total.

import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../../auth/auth';
import { NOME_MODULO, RELATORIOS, rotaDoRelatorio, type Modulo } from '../../auth/modulos';
import { hoje, mesAbrev, mesChave } from '../../lib/dates';
import { moeda } from '../../lib/format';
import { useDb } from '../../data/store';
import { dre, saldoTotal } from '../../data/selectors';
import { relatorioNotas, relatorioVendas, titulosEmAberto, ultimosMeses } from '../../data/relatorios';
import { Icone } from '../../components/Icone';
import { Vazio } from '../../components/ui';
import { RelatorioGerencial } from './Gerencial';
import { RelatorioTitulos } from './Titulos';
import { RelatorioVendas } from './Vendas';
import { RelatorioNotas } from './Notas';
import { RelatorioContador } from './Contador';

interface Destaque {
  valor: string;
  rotulo: string;
  tom?: 'entrada' | 'saida' | 'critico';
}

function useDestaques(): Record<string, Destaque> {
  const db = useDb();
  return useMemo(() => {
    const ref = hoje();
    const tres = ultimosMeses(3, false, ref);
    const mes = [mesChave(ref)];
    const g = dre(db, tres, 'caixa');
    const resultado = g.resultado.reduce((a, b) => a + b, 0);
    const rec = titulosEmAberto(db, 'receber', ref);
    const pag = titulosEmAberto(db, 'pagar', ref);
    const v = relatorioVendas(db, mes);
    const n = relatorioNotas(db, mes);
    return {
      gerencial: { valor: moeda(resultado, { sinal: true }), rotulo: `resultado de ${mesAbrev(tres[0])} a ${mesAbrev(tres[2])}`, tom: resultado >= 0 ? 'entrada' : 'critico' },
      'a-receber': { valor: moeda(rec.total), rotulo: rec.vencido ? `${moeda(rec.vencido)} atrasado` : 'em aberto, nada atrasado', tom: rec.vencido ? 'critico' : 'entrada' },
      'a-pagar': { valor: moeda(pag.total), rotulo: pag.vencido ? `${moeda(pag.vencido)} vencido` : 'em aberto, nada vencido', tom: pag.vencido ? 'critico' : 'saida' },
      fluxo: { valor: moeda(saldoTotal(db, ref)), rotulo: 'saldo em caixa hoje' },
      contador: { valor: String(db.lancamentos.length), rotulo: 'lançamentos para exportar' },
      vendas: { valor: moeda(v.total), rotulo: 'vendido neste mês', tom: 'entrada' },
      notas: { valor: String(n.emitidas), rotulo: 'notas emitidas neste mês' },
    };
  }, [db]);
}

function Indice() {
  const { modulos } = useAuth();
  const [params] = useSearchParams();
  const pedido = params.get('m') as Modulo | null;
  const filtro = pedido && modulos.includes(pedido) ? pedido : null;
  const mostrar = filtro ? [filtro] : modulos;
  const destaques = useDestaques();

  return (
    <div className="relatorios">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">{filtro ? NOME_MODULO[filtro] : 'Todos os módulos'}</p>
          <h1>Relatórios</h1>
        </div>
        {modulos.length > 1 && (
          <div className="pagina-cabeca__acoes">
            {filtro ? (
              <Link to="/relatorios" className="btn btn--secundario">
                Ver de todos os módulos
              </Link>
            ) : null}
          </div>
        )}
      </header>

      {mostrar.length === 0 && <Vazio icone="relatorios" titulo="Nenhum relatório para o seu acesso" texto="Peça ao administrador para marcar um módulo no seu usuário." />}

      {mostrar.map((m) => {
        const lista = RELATORIOS.filter((r) => r.modulo === m);
        return (
          <section key={m} className="indice-rel" aria-label={`Relatórios do ${NOME_MODULO[m]}`}>
            {!filtro && (
              <div className="secao-titulo">
                <h2>{NOME_MODULO[m]}</h2>
              </div>
            )}
            <ul className="indice-rel__lista">
              {lista.map((r) => {
                const d = destaques[r.id];
                return (
                  <li key={r.id}>
                    <Link to={rotaDoRelatorio(r)} className="indice-rel__item">
                      <span className="indice-rel__texto">
                        <strong>{r.titulo}</strong>
                        <span>{r.descricao}</span>
                      </span>
                      {d && (
                        <span className="indice-rel__numero">
                          <strong className={`num${d.tom ? ` ${d.tom}-txt` : ''}`}>{d.valor}</strong>
                          <span>{d.rotulo}</span>
                        </span>
                      )}
                      <Icone nome="direita" tam={18} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const TELAS: Record<string, () => React.JSX.Element> = {
  gerencial: RelatorioGerencial,
  'a-receber': () => <RelatorioTitulos tipo="receber" />,
  'a-pagar': () => <RelatorioTitulos tipo="pagar" />,
  contador: RelatorioContador,
  vendas: RelatorioVendas,
  notas: RelatorioNotas,
};

/** /relatorios = lista para escolher; /relatorios/:id = o relatório (o acesso por módulo é checado no AppShell). */
export function Relatorios() {
  const { id } = useParams();
  if (!id) return <Indice />;
  const Tela = TELAS[id];
  if (!Tela)
    return (
      <Vazio
        icone="relatorios"
        titulo="Relatório não encontrado"
        acao={
          <Link to="/relatorios" className="btn btn--secundario">
            Ver os relatórios
          </Link>
        }
      />
    );
  return <Tela key={id} />;
}
