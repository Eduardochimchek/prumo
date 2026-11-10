// Cadastro de produtos e serviços: o que a empresa vende, com o mínimo para sair na nota.

import { useMemo, useState } from 'react';
import { contem, moeda, plural } from '../lib/format';
import { useDb } from '../data/store';
import { salvarProduto } from '../data/actions';
import type { Produto, TipoProduto } from '../data/types';
import { useAuth, useUsuario } from '../auth/auth';
import { useAvisos } from '../components/Avisos';
import { Camada } from '../components/Camada';
import { Icone } from '../components/Icone';
import { Botao, Caixa, Campo, Entrada, EntradaMoeda, Segmentado, Selecao, Vazio } from '../components/ui';

const UNIDADES = ['UN', 'SC', 'GL', 'CX', 'PC', 'CH', 'DZ', 'RL', 'PR', 'BD', 'M', 'M2', 'KG', 'L', 'H', 'SV'];

function FormProduto({ editando, tipoInicial, aoFechar }: { editando?: Produto; tipoInicial: TipoProduto; aoFechar: () => void }) {
  const usuario = useUsuario();
  const { avisar, erro } = useAvisos();
  const [tipo, setTipo] = useState<TipoProduto>(editando?.tipo ?? tipoInicial);
  const [nome, setNome] = useState(editando?.nome ?? '');
  const [codigo, setCodigo] = useState(editando?.codigo ?? '');
  const [unidade, setUnidade] = useState(editando?.unidade ?? (tipoInicial === 'servico' ? 'SV' : 'UN'));
  const [preco, setPreco] = useState(editando?.preco ?? 0);
  const [ncm, setNcm] = useState(editando?.ncm ?? '');
  const [codigoServico, setCodigoServico] = useState(editando?.codigoServico ?? '');
  const [ativo, setAtivo] = useState(editando?.ativo ?? true);

  const salvar = () => {
    try {
      salvarProduto(
        { id: editando?.id, tipo, nome: nome.trim(), codigo, unidade, preco, ncm: tipo === 'produto' ? ncm || undefined : undefined, codigoServico: tipo === 'servico' ? codigoServico || undefined : undefined, ativo },
        usuario.id,
      );
      avisar(editando ? 'Item atualizado.' : `${tipo === 'servico' ? 'Serviço' : 'Produto'} cadastrado.`);
      aoFechar();
    } catch (e) {
      erro(e);
    }
  };

  return (
    <Camada
      aberta
      aoFechar={aoFechar}
      tipo="gaveta"
      sobretitulo={editando ? 'Editar item' : 'Novo item'}
      titulo={editando ? editando.nome : tipo === 'servico' ? 'Serviço' : 'Produto'}
      rodape={
        <>
          <span className="espaco" />
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone="check" onClick={salvar}>
            Salvar
          </Botao>
        </>
      }
    >
      <form
        className="grade-form"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <div>
          <Segmentado
            rotulo="Tipo"
            valor={tipo}
            aoMudar={setTipo}
            opcoes={[
              { valor: 'produto', rotulo: 'Produto' },
              { valor: 'servico', rotulo: 'Serviço' },
            ]}
          />
        </div>
        <Campo rotulo="Nome (como sai na nota)" htmlFor="p-nome">
          <Entrada id="p-nome" autoFocus={!editando} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={tipo === 'servico' ? 'Ex.: Entrega na obra' : 'Ex.: Cimento CP II 50 kg'} />
        </Campo>
        <Campo className="c2 m3" rotulo="Código" htmlFor="p-cod" dica="Vazio = automático">
          <Entrada id="p-cod" className="entrada--mono" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
        </Campo>
        <Campo className="c2 m3" rotulo="Unidade" htmlFor="p-un">
          <Selecao id="p-un" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            {UNIDADES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Selecao>
        </Campo>
        <Campo className="c2" rotulo="Preço de venda" htmlFor="p-preco">
          <EntradaMoeda id="p-preco" valor={preco} aoMudar={setPreco} />
        </Campo>
        {tipo === 'produto' ? (
          <Campo rotulo="NCM" htmlFor="p-ncm" dica="Classificação fiscal do produto, 8 números. O contador ou o fornecedor informam (vem na nota de compra).">
            <Entrada id="p-ncm" className="entrada--mono" inputMode="numeric" maxLength={8} value={ncm} onChange={(e) => setNcm(e.target.value.replace(/\D/g, ''))} />
          </Campo>
        ) : (
          <Campo rotulo="Código do serviço" htmlFor="p-srv" dica="Item da lista de serviços (LC 116), ex.: 14.01. O contador informa.">
            <Entrada id="p-srv" className="entrada--mono" value={codigoServico} onChange={(e) => setCodigoServico(e.target.value)} placeholder="00.00" />
          </Campo>
        )}
        <div>
          <Caixa rotulo="Disponível para venda" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        </div>
      </form>
    </Camada>
  );
}

export function Produtos() {
  const db = useDb();
  const { pode } = useAuth();
  const [tipo, setTipo] = useState<TipoProduto>('produto');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<{ id?: string } | null>(null);

  const vendidos = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of db.vendas) if (v.etapa === 'faturada') for (const i of v.itens) m.set(i.produtoId, (m.get(i.produtoId) ?? 0) + i.total);
    return m;
  }, [db.vendas]);

  const lista = db.produtos
    .filter((p) => p.tipo === tipo)
    .filter((p) => !busca.trim() || contem(p.nome, busca) || contem(p.codigo, busca) || (p.ncm ?? '').includes(busca))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const nProd = db.produtos.filter((p) => p.tipo === 'produto').length;
  const nServ = db.produtos.filter((p) => p.tipo === 'servico').length;

  return (
    <div className="produtos">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">Cadastros</p>
          <h1>Produtos e serviços</h1>
          <p className="lede">
            <strong>{plural(nProd, 'produto', 'produtos')}</strong> e <strong>{plural(nServ, 'serviço', 'serviços')}</strong>. Nome, unidade e preço bastam para o orçamento; o NCM ou o código do
            serviço é o que a nota precisa.
          </p>
        </div>
        <div className="pagina-cabeca__acoes">
          {pode('lancar') && (
            <Botao variante="primario" icone="mais" onClick={() => setForm({})}>
              Novo item
            </Botao>
          )}
        </div>
      </header>

      <div className="filtros">
        <Segmentado
          rotulo="Tipo"
          valor={tipo}
          aoMudar={setTipo}
          opcoes={[
            { valor: 'produto', rotulo: 'Produtos', contagem: nProd },
            { valor: 'servico', rotulo: 'Serviços', contagem: nServ },
          ]}
        />
        <div className="filtros__campos">
          <div className="entrada-grupo filtros__busca">
            <span className="entrada-grupo__prefixo">
              <Icone nome="busca" tam={16} />
            </span>
            <Entrada placeholder="Nome, código ou NCM…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produtos" />
          </div>
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio icone="grade" titulo="Nenhum item" texto="Cadastre o que a empresa vende para usar nos orçamentos." />
      ) : (
        <div className="tabela-rolagem painel">
          <table className="razao">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th className="esconder-movel">{tipo === 'produto' ? 'NCM' : 'Serviço'}</th>
                <th className="esconder-movel dir">Vendido</th>
                <th className="dir">Preço</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => pode('lancar') && setForm({ id: p.id })} style={{ opacity: p.ativo ? 1 : 0.55 }}>
                  <td className="mono apertada">{p.codigo}</td>
                  <td>
                    <div className="celula-principal">
                      <strong>{p.nome}</strong>
                      <span>por {p.unidade}{p.ativo ? '' : ' · fora de venda'}</span>
                    </div>
                  </td>
                  <td className="mono esconder-movel">{p.tipo === 'produto' ? p.ncm ?? '-' : p.codigoServico ?? '-'}</td>
                  <td className="valor esconder-movel muted">{vendidos.get(p.id) ? moeda(vendidos.get(p.id)!) : '-'}</td>
                  <td className="valor">{moeda(p.preco)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <FormProduto key={form.id ?? 'novo'} editando={form.id ? db.produtos.find((p) => p.id === form.id) : undefined} tipoInicial={tipo} aoFechar={() => setForm(null)} />}
    </div>
  );
}
