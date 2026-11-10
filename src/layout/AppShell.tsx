// Estrutura das telas internas. Desktop: cabeçalho em duas linhas (marca + seções, como um jornal).
// Celular: barra superior compacta + barra inferior com o botão de lançar no centro.

import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth, useUsuario, NOME_PAPEL } from '../auth/auth';
import { useDb } from '../data/store';
import { briefing } from '../data/selectors';
import { useTema, type Tema } from '../lib/tema';
import { Icone, type NomeIcone } from '../components/Icone';
import { Marca, MarcaSimbolo } from '../components/Marca';
import { Avatar, Botao, ItemMenu, MenuSuspenso } from '../components/ui';
import { Camada } from '../components/Camada';
import { useAcoes } from '../components/Acoes';

interface ItemNav {
  rota: string;
  rotulo: string;
  icone: NomeIcone;
  contagem?: number;
  alerta?: boolean;
  fim?: boolean;
}

function SeletorTema({ tema, setTema }: { tema: Tema; setTema: (t: Tema) => void }) {
  return (
    <div className="segmentado" role="group" aria-label="Tema">
      {(
        [
          ['claro', 'sol', 'Claro'],
          ['escuro', 'lua', 'Escuro'],
          ['sistema', 'grade', 'Auto'],
        ] as const
      ).map(([v, i, r]) => (
        <button key={v} type="button" aria-pressed={tema === v} onClick={() => setTema(v)}>
          <Icone nome={i} tam={15} /> {r}
        </button>
      ))}
    </div>
  );
}

export function AppShell() {
  const db = useDb();
  const usuario = useUsuario();
  const { sair, pode } = useAuth();
  const acoes = useAcoes();
  const navegar = useNavigate();
  const local = useLocation();
  const [tema, setTema] = useTema();
  const [mais, setMais] = useState(false);
  const [lancar, setLancar] = useState(false);

  const b = useMemo(() => briefing(db), [db]);

  const itens: ItemNav[] = [
    { rota: '/', rotulo: 'Hoje', icone: 'hoje', fim: true },
    { rota: '/contas/pagar', rotulo: 'A pagar', icone: 'pagar', contagem: b.pagar.vencido.qtd + b.pagar.hoje.qtd || undefined, alerta: b.pagar.vencido.qtd > 0 },
    { rota: '/contas/receber', rotulo: 'A receber', icone: 'receber', contagem: b.receber.vencido.qtd || undefined, alerta: b.receber.vencido.qtd > 0 },
    { rota: '/notas', rotulo: 'Notas fiscais', icone: 'nota', contagem: b.sefazPendentes.length + b.notasSemTitulo.length || undefined },
    { rota: '/fluxo', rotulo: 'Fluxo de caixa', icone: 'fluxo' },
    { rota: '/contatos', rotulo: 'Contatos', icone: 'contatos' },
    { rota: '/relatorios', rotulo: 'Relatórios', icone: 'relatorios' },
  ];
  const admin: ItemNav[] = [
    ...(pode('usuarios') ? [{ rota: '/usuarios', rotulo: 'Usuários', icone: 'usuarios' as const }] : []),
    { rota: '/configuracoes', rotulo: 'Configurações', icone: 'ajustes' },
  ];

  const tituloAtual =
    [...itens, ...admin].filter((i) => (i.fim ? local.pathname === i.rota : local.pathname.startsWith(i.rota))).pop()?.rotulo ?? 'Prumo';

  const menuUsuario = (
    <MenuSuspenso
      rotulo="Conta"
      gatilho={(abrir, aberto) => (
        <button type="button" className="barra__usuario" onClick={abrir} aria-expanded={aberto} aria-label={`Conta de ${usuario.nome}`}>
          <Avatar nome={usuario.nome} />
        </button>
      )}
    >
      {(fechar) => (
        <>
          <div className="menu__cabeca">
            <strong>{usuario.nome}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              {usuario.email}
            </div>
            <span className="carimbo carimbo--aberto" style={{ marginTop: 8 }}>
              {NOME_PAPEL[usuario.papel]}
            </span>
          </div>
          <div className="menu__sep" />
          <div style={{ padding: '4px 6px 8px' }}>
            <SeletorTema tema={tema} setTema={setTema} />
          </div>
          <ItemMenu icone="usuario" onClick={() => { fechar(); navegar('/configuracoes?aba=perfil'); }}>
            Meu perfil e senha
          </ItemMenu>
          {pode('usuarios') && (
            <ItemMenu icone="usuarios" onClick={() => { fechar(); navegar('/usuarios'); }}>
              Usuários e acessos
            </ItemMenu>
          )}
          <ItemMenu icone="ajustes" onClick={() => { fechar(); navegar('/configuracoes'); }}>
            Configurações
          </ItemMenu>
          <div className="menu__sep" />
          <ItemMenu icone="sair" onClick={() => { fechar(); sair(); }}>
            Sair
          </ItemMenu>
        </>
      )}
    </MenuSuspenso>
  );

  const opcoesLancar = (fechar: () => void): ReactNode => (
    <>
      {pode('lancar') && (
        <>
          <ItemMenu icone="pagar" onClick={() => { fechar(); acoes.novoLancamento({ tipo: 'pagar' }); }}>
            Conta a pagar
          </ItemMenu>
          <ItemMenu icone="receber" onClick={() => { fechar(); acoes.novoLancamento({ tipo: 'receber' }); }}>
            Conta a receber
          </ItemMenu>
        </>
      )}
      {pode('importar') && (
        <ItemMenu icone="enviar" onClick={() => { fechar(); acoes.importarNotas(); }}>
          Importar XML de nota
        </ItemMenu>
      )}
      {pode('contatos') && (
        <ItemMenu icone="contatos" onClick={() => { fechar(); acoes.novoContato(); }}>
          Cliente ou fornecedor
        </ItemMenu>
      )}
    </>
  );

  return (
    <div className="app">
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>

      {/* ---------- Desktop ---------- */}
      <header className="cabecalho nao-imprimir">
        <div className="barra">
          <div className="barra__esq">
            <NavLink to="/" className="barra__marca" aria-label="Prumo, início">
              <Marca />
            </NavLink>
            <span className="barra__empresa" title={`CNPJ ${db.empresa.cnpj}`}>
              {db.empresa.nomeFantasia}
            </span>
            {db.demo && (
              <span className="carimbo carimbo--latao" title="Dados fictícios para demonstração. Em Configurações você zera e começa a usar de verdade.">
                Demonstração
              </span>
            )}
          </div>
          <div className="barra__dir">
            <button type="button" className="barra__busca" onClick={acoes.abrirPaleta}>
              <Icone nome="busca" tam={16} />
              <span>Buscar ou executar…</span>
              <span className="kbd">Ctrl K</span>
            </button>
            {(pode('lancar') || pode('importar')) && (
              <MenuSuspenso rotulo="Lançar" gatilho={(abrir) => <Botao variante="primario" icone="mais" onClick={abrir}>Lançar</Botao>}>
                {opcoesLancar}
              </MenuSuspenso>
            )}
            {menuUsuario}
          </div>
        </div>
        <nav className="secoes" aria-label="Seções">
          <div className="secoes__lista">
            {itens.map((i) => (
              <NavLink key={i.rota} to={i.rota} end={i.fim} className="secoes__item">
                {i.rotulo}
                {i.contagem ? <span className={`secoes__contagem${i.alerta ? ' secoes__contagem--alerta' : ''}`}>{i.contagem}</span> : null}
              </NavLink>
            ))}
          </div>
          <div className="secoes__lista secoes__lista--admin">
            {admin.map((i) => (
              <NavLink key={i.rota} to={i.rota} className="secoes__item">
                {i.rotulo}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      {/* ---------- Celular ---------- */}
      <header className="topo-movel nao-imprimir">
        <NavLink to="/" aria-label="Prumo, início" className="topo-movel__marca">
          <MarcaSimbolo tam={22} />
        </NavLink>
        <span className="topo-movel__titulo">{tituloAtual}</span>
        <button type="button" className="btn btn--fantasma btn--icone" onClick={acoes.abrirPaleta} aria-label="Buscar">
          <Icone nome="busca" />
        </button>
        {menuUsuario}
      </header>

      <main id="conteudo" className="conteudo">
        {db.demo && (
          <div className="faixa-demo nao-imprimir">
            Dados de demonstração. Explore à vontade; em <NavLink to="/configuracoes?aba=dados">Configurações → Dados</NavLink> você zera tudo e começa de verdade.
          </div>
        )}
        <Outlet />
      </main>

      <nav className="nav-movel nao-imprimir" aria-label="Navegação principal">
        <NavLink to="/" end className="nav-movel__item">
          <Icone nome="hoje" tam={22} />
          <span>Hoje</span>
        </NavLink>
        <NavLink to="/contas/pagar" className={({ isActive }) => `nav-movel__item${isActive || local.pathname.startsWith('/contas') ? ' active' : ''}`}>
          <Icone nome="pagar" tam={22} />
          <span>Contas</span>
          {b.pagar.vencido.qtd + b.receber.vencido.qtd > 0 && <i className="nav-movel__ponto" aria-label="há contas vencidas" />}
        </NavLink>
        {pode('lancar') || pode('importar') ? (
          <button type="button" className="nav-movel__lancar" onClick={() => setLancar(true)} aria-label="Lançar">
            <Icone nome="mais" tam={26} traco={2} />
          </button>
        ) : (
          <NavLink to="/fluxo" className="nav-movel__item">
            <Icone nome="fluxo" tam={22} />
            <span>Fluxo</span>
          </NavLink>
        )}
        <NavLink to="/notas" className="nav-movel__item">
          <Icone nome="nota" tam={22} />
          <span>Notas</span>
        </NavLink>
        <button type="button" className={`nav-movel__item${mais ? ' active' : ''}`} onClick={() => setMais(true)}>
          <Icone nome="menu" tam={22} />
          <span>Mais</span>
        </button>
      </nav>

      <Camada aberta={mais} aoFechar={() => setMais(false)} titulo="Menu" sobretitulo={db.empresa.nomeFantasia} tipo="gaveta">
        <div className="mais__usuario">
          <Avatar nome={usuario.nome} tam="g" />
          <div>
            <strong>{usuario.nome}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              {NOME_PAPEL[usuario.papel]} · {usuario.email}
            </div>
          </div>
        </div>
        <nav className="mais__lista">
          {[...itens.slice(1), ...admin].map((i) => (
            <NavLink key={i.rota} to={i.rota} className="mais__item" onClick={() => setMais(false)}>
              <Icone nome={i.icone} />
              <span>{i.rotulo}</span>
              {i.contagem ? <span className={`secoes__contagem${i.alerta ? ' secoes__contagem--alerta' : ''}`}>{i.contagem}</span> : null}
              <Icone nome="direita" tam={16} />
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 18 }}>
          <span className="rotulo">Tema</span>
          <div style={{ marginTop: 8 }}>
            <SeletorTema tema={tema} setTema={setTema} />
          </div>
        </div>
        <Botao bloco icone="sair" style={{ marginTop: 22 }} onClick={() => { setMais(false); sair(); }}>
          Sair
        </Botao>
      </Camada>

      <Camada aberta={lancar} aoFechar={() => setLancar(false)} titulo="O que você quer lançar?" tipo="modal">
        <div className="lancar-grade">
          {(
            [
              ['pagar', 'Conta a pagar', 'Boleto, aluguel, fornecedor…', () => acoes.novoLancamento({ tipo: 'pagar' }), pode('lancar')],
              ['receber', 'Conta a receber', 'Venda, serviço, parcela…', () => acoes.novoLancamento({ tipo: 'receber' }), pode('lancar')],
              ['enviar', 'Importar nota (XML)', 'Gera as contas pelas duplicatas', () => acoes.importarNotas(), pode('importar')],
              ['contatos', 'Cliente ou fornecedor', 'Busca o CNPJ na Receita', () => acoes.novoContato(), pode('contatos')],
            ] as const
          )
            .filter((o) => o[4])
            .map(([icone, titulo, texto, fn]) => (
              <button
                key={titulo}
                type="button"
                className="lancar-opcao"
                onClick={() => {
                  setLancar(false);
                  fn();
                }}
              >
                <Icone nome={icone} tam={22} />
                <strong>{titulo}</strong>
                <span>{texto}</span>
              </button>
            ))}
        </div>
      </Camada>
    </div>
  );
}
