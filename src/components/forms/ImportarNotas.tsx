// Importação de XML de NF-e: arrasta um ou vários arquivos, confere o resumo de cada nota
// e o Prumo cadastra o fornecedor/cliente e gera as contas a pagar/receber pelas duplicatas.

import { useState } from 'react';
import { dataBR } from '../../lib/dates';
import { moeda, plural } from '../../lib/format';
import { mascaraDocumento } from '../../lib/br';
import { ErroLeituraNFe, lerXmlNFe, type NFeDados } from '../../lib/nfe/parser';
import { exemploNFeParaEmpresa, gerarXmlNFe } from '../../lib/nfe/exemplo';
import { baixarArquivo, lerArquivoTexto } from '../../lib/util';
import { useDb } from '../../data/store';
import { direcaoDaNota, importarNotas, type Direcao } from '../../data/actions';
import { useUsuario } from '../../auth/auth';
import { Camada } from '../Camada';
import { Icone } from '../Icone';
import { Botao, Caixa, CarimboTexto, Selecao } from '../ui';
import { useAvisos } from '../Avisos';

interface Item {
  arquivo: string;
  dados?: NFeDados;
  erro?: string;
  direcao?: Direcao;
  duplicada?: boolean;
  gerar: boolean;
  categoriaId: string;
}

export function ImportarNotas({ aberta, aoFechar, aoConcluir }: { aberta: boolean; aoFechar: () => void; aoConcluir?: (notaIds: string[]) => void }) {
  const db = useDb();
  const usuario = useUsuario();
  const { avisar, erro } = useAvisos();
  const [itens, setItens] = useState<Item[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [lendo, setLendo] = useState(false);

  const catPadrao = (dir: Direcao) => {
    const nome = dir === 'saida' ? 'Venda de mercadorias' : 'Compra de mercadorias';
    return db.categorias.find((c) => c.nome === nome)?.id ?? '';
  };

  const ler = async (arquivos: FileList | File[]) => {
    setLendo(true);
    const novos: Item[] = [];
    for (const f of Array.from(arquivos)) {
      if (!/\.xml$/i.test(f.name)) {
        novos.push({ arquivo: f.name, erro: 'Não é um arquivo .xml (o PDF do DANFE não serve, precisa do XML).', gerar: false, categoriaId: '' });
        continue;
      }
      try {
        const dados = lerXmlNFe(await lerArquivoTexto(f));
        const direcao = direcaoDaNota(dados, db.empresa.cnpj);
        const duplicada = db.notas.some((n) => n.chave === dados.chave) || novos.some((n) => n.dados?.chave === dados.chave);
        novos.push({ arquivo: f.name, dados, direcao, duplicada, gerar: !duplicada && dados.situacao === 'autorizada', categoriaId: catPadrao(direcao) });
      } catch (e) {
        novos.push({ arquivo: f.name, erro: e instanceof ErroLeituraNFe ? e.message : 'Não consegui ler este arquivo.', gerar: false, categoriaId: '' });
      }
    }
    setItens((atual) => [...atual, ...novos]);
    setLendo(false);
  };

  const validos = itens.filter((i) => i.dados && !i.duplicada);

  const confirmar = () => {
    try {
      const r = importarNotas(
        validos.map((i) => ({ dados: i.dados!, gerarTitulos: i.gerar, categoriaId: i.categoriaId || undefined })),
        usuario.id,
      );
      avisar(
        `${plural(r.notas.length, 'nota importada', 'notas importadas')}` +
          (r.titulos ? ` · ${plural(r.titulos, 'conta lançada', 'contas lançadas')}` : '') +
          (r.contatosNovos ? ` · ${plural(r.contatosNovos, 'contato novo', 'contatos novos')}` : ''),
      );
      aoConcluir?.(r.notas.map((n) => n.id));
      setItens([]);
      aoFechar();
    } catch (e) {
      erro(e);
    }
  };

  const baixarExemplo = () => {
    const dados = exemploNFeParaEmpresa(db.empresa);
    baixarArquivo(`NFe-exemplo-${dados.numero}.xml`, gerarXmlNFe(dados), 'application/xml');
  };

  const textoDirecao: Record<Direcao, string> = {
    entrada: 'Entrada · você é o destinatário → contas a pagar',
    saida: 'Saída · você é o emitente → contas a receber',
    terceiros: 'Atenção: o CNPJ da sua empresa não aparece nesta nota (será tratada como entrada)',
  };

  return (
    <Camada
      aberta={aberta}
      aoFechar={() => {
        setItens([]);
        aoFechar();
      }}
      largo
      sobretitulo="Notas fiscais"
      titulo="Importar XML de NF-e"
      rodape={
        <>
          <Botao variante="fantasma" icone="baixar" tam="p" onClick={baixarExemplo}>
            Baixar XML de exemplo
          </Botao>
          <span className="espaco" />
          <Botao variante="fantasma" onClick={() => { setItens([]); aoFechar(); }}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone="check" disabled={validos.length === 0} onClick={confirmar}>
            {validos.length ? `Importar ${plural(validos.length, 'nota', 'notas')}` : 'Importar'}
          </Botao>
        </>
      }
    >
      <label
        className={`bandeja${arrastando ? ' bandeja--ativa' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (e.dataTransfer.files.length) void ler(e.dataTransfer.files);
        }}
      >
        <Icone nome="enviar" tam={28} traco={1.3} />
        <strong>{lendo ? 'Lendo arquivos…' : 'Solte aqui os XML das notas'}</strong>
        <span className="muted" style={{ fontSize: 13.5 }}>
          ou toque para escolher · aceita vários de uma vez · NF-e e NFC-e (layout 4.00)
        </span>
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) void ler(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {itens.length > 0 && (
        <ul className="importacao">
          {itens.map((it, i) => (
            <li key={`${it.arquivo}-${i}`} className={it.erro || it.duplicada ? 'importacao__item importacao__item--falha' : 'importacao__item'}>
              {it.erro || !it.dados ? (
                <div className="importacao__erro">
                  <Icone nome="alerta" />
                  <div>
                    <strong>{it.arquivo}</strong>
                    <p>{it.erro}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="importacao__cabeca">
                    <div style={{ minWidth: 0 }}>
                      <span className="rotulo">
                        NF {it.dados.numero} · série {it.dados.serie} · {dataBR(it.dados.emissao.slice(0, 10))}
                      </span>
                      <strong className="truncar" style={{ display: 'block' }}>
                        {it.direcao === 'saida' ? it.dados.destinatario.nome : it.dados.emitente.nome}
                      </strong>
                      <span className="muted mono" style={{ fontSize: 12.5 }}>
                        {mascaraDocumento(it.direcao === 'saida' ? it.dados.destinatario.documento : it.dados.emitente.documento)}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong className="num importacao__valor">{moeda(it.dados.totais.nota)}</strong>
                      <div>
                        {it.duplicada ? (
                          <CarimboTexto variante="aberto">Já importada</CarimboTexto>
                        ) : it.dados.situacao === 'autorizada' ? (
                          <CarimboTexto variante="pago">Autorizada</CarimboTexto>
                        ) : (
                          <CarimboTexto variante="vencido">{it.dados.situacao === 'cancelada' ? 'Cancelada' : 'Sem protocolo'}</CarimboTexto>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className={`importacao__direcao${it.direcao === 'terceiros' ? ' critico-txt' : ''}`}>{textoDirecao[it.direcao!]}</p>
                  {!it.duplicada && (
                    <div className="importacao__opcoes">
                      <Caixa
                        checked={it.gerar}
                        disabled={it.dados.situacao !== 'autorizada'}
                        onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, gerar: e.target.checked } : x)))}
                        rotulo={
                          it.dados.duplicatas.length
                            ? `Gerar ${plural(it.dados.duplicatas.length, 'conta', 'contas')} a ${it.direcao === 'saida' ? 'receber' : 'pagar'}: ${it.dados.duplicatas.map((d) => `${dataBR(d.vencimento).slice(0, 5)} ${moeda(d.valor)}`).join(' · ')}`
                            : `Gerar 1 conta à vista (${moeda(it.dados.totais.nota)})`
                        }
                      />
                      {it.gerar && (
                        <Selecao
                          aria-label="Categoria"
                          value={it.categoriaId}
                          style={{ maxWidth: 260, height: 34, fontSize: 13.5 }}
                          onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, categoriaId: e.target.value } : x)))}
                        >
                          {db.categorias
                            .filter((c) => c.tipo === (it.direcao === 'saida' ? 'receita' : 'despesa'))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome}
                              </option>
                            ))}
                        </Selecao>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="aviso-caixa" style={{ marginTop: 16 }}>
        <Icone nome="info" />
        <span>
          Onde achar o XML: o fornecedor envia por e-mail junto com o boleto, ou baixe no portal da SEFAZ do seu estado.
          Com a integração SEFAZ (próxima versão), as notas emitidas contra o seu CNPJ chegam sozinhas.
        </span>
      </div>
    </Camada>
  );
}
