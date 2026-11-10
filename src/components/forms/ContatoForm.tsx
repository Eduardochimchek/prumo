// Cadastro de cliente/fornecedor. Digitou o CNPJ, o Prumo busca na Receita (BrasilAPI)
// e preenche razão social, endereço e contato. CEP também preenche cidade e UF.

import { useState } from 'react';
import { cnpjAlfanumerico, cnpjValido, documentoValido, mascaraCep, mascaraDocumento, mascaraTelefone, normalizarDocumento, UFS } from '../../lib/br';
import { consultarCep, consultarCnpj } from '../../services/brasilapi';
import { salvarContato } from '../../data/actions';
import type { Contato, TipoContato } from '../../data/types';
import { useUsuario } from '../../auth/auth';
import { Camada } from '../Camada';
import { Icone } from '../Icone';
import { AreaTexto, Botao, Campo, CarimboTexto, Entrada, Segmentado, Selecao } from '../ui';
import { useAvisos } from '../Avisos';

export function ContatoForm({
  aberta,
  aoFechar,
  editando,
  tipoInicial = 'cliente',
  aoSalvar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  editando?: Contato;
  tipoInicial?: TipoContato;
  aoSalvar?: (c: Contato) => void;
}) {
  const usuario = useUsuario();
  const { avisar, erro } = useAvisos();
  const [tipo, setTipo] = useState<TipoContato>(editando?.tipo ?? tipoInicial);
  const [documento, setDocumento] = useState(editando?.documento ? mascaraDocumento(editando.documento) : '');
  const [nome, setNome] = useState(editando?.nome ?? '');
  const [fantasia, setFantasia] = useState(editando?.fantasia ?? '');
  const [email, setEmail] = useState(editando?.email ?? '');
  const [telefone, setTelefone] = useState(editando?.telefone ?? '');
  const [cep, setCep] = useState(editando?.cep ?? '');
  const [endereco, setEndereco] = useState(editando?.endereco ?? '');
  const [cidade, setCidade] = useState(editando?.cidade ?? '');
  const [uf, setUf] = useState(editando?.uf ?? '');
  const [observacoes, setObservacoes] = useState(editando?.observacoes ?? '');
  const [buscando, setBuscando] = useState(false);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [tentou, setTentou] = useState(false);

  const docNorm = normalizarDocumento(documento);
  const docCompleto = docNorm.length === 11 || docNorm.length === 14;
  const docInvalido = docCompleto && !documentoValido(docNorm);
  const podeBuscar = docNorm.length === 14 && cnpjValido(docNorm) && !cnpjAlfanumerico(docNorm);

  const buscarCnpj = async () => {
    setBuscando(true);
    try {
      const d = await consultarCnpj(docNorm);
      setNome(d.razaoSocial);
      if (d.nomeFantasia) setFantasia(d.nomeFantasia);
      if (d.email) setEmail(d.email);
      if (d.telefone) setTelefone(d.telefone);
      if (d.cep) setCep(d.cep);
      if (d.endereco) setEndereco(d.endereco);
      if (d.cidade) setCidade(d.cidade);
      if (d.uf) setUf(d.uf);
      setSituacao(d.situacao ?? null);
      avisar('Dados preenchidos com o cadastro da Receita Federal.');
    } catch (e) {
      erro(e);
    } finally {
      setBuscando(false);
    }
  };

  const aoSairCep = async () => {
    if (cep.replace(/\D/g, '').length !== 8 || cidade) return;
    try {
      const d = await consultarCep(cep);
      setCidade(d.cidade);
      setUf(d.uf);
      if (!endereco && d.rua) setEndereco([d.rua, d.bairro].filter(Boolean).join(', '));
    } catch {
      /* CEP não encontrado: segue manual */
    }
  };

  const salvar = () => {
    setTentou(true);
    if (!nome.trim() || docInvalido) return;
    try {
      const salvo = salvarContato(
        {
          id: editando?.id,
          tipo,
          nome: nome.trim(),
          fantasia: fantasia.trim() || undefined,
          documento: docNorm,
          email: email.trim() || undefined,
          telefone: telefone.trim() || undefined,
          cep: cep.trim() || undefined,
          endereco: endereco.trim() || undefined,
          cidade: cidade.trim() || undefined,
          uf: uf || undefined,
          observacoes: observacoes.trim() || undefined,
        },
        usuario.id,
      );
      avisar(editando ? 'Contato atualizado.' : `${salvo.fantasia || salvo.nome} cadastrado.`);
      aoSalvar?.(salvo);
      aoFechar();
    } catch (e) {
      erro(e);
    }
  };

  return (
    <Camada
      aberta={aberta}
      aoFechar={aoFechar}
      tipo="gaveta"
      sobretitulo={editando ? 'Editar contato' : 'Novo contato'}
      titulo={editando ? editando.fantasia || editando.nome : 'Cliente ou fornecedor'}
      rodape={
        <>
          <span className="espaco" />
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone="check" onClick={salvar}>
            Salvar contato
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
            rotulo="Tipo de contato"
            valor={tipo}
            aoMudar={setTipo}
            opcoes={[
              { valor: 'cliente', rotulo: 'Cliente' },
              { valor: 'fornecedor', rotulo: 'Fornecedor' },
              { valor: 'ambos', rotulo: 'Os dois' },
            ]}
          />
        </div>

        <Campo
          rotulo="CNPJ ou CPF"
          htmlFor="c-doc"
          erro={docInvalido ? 'Documento inválido. Confira os dígitos.' : null}
          dica={cnpjAlfanumerico(docNorm) ? 'CNPJ alfanumérico (novo formato da Receita), aceito.' : 'Com o CNPJ, buscamos os dados na Receita automaticamente.'}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <Entrada
              id="c-doc"
              className="entrada--mono"
              value={documento}
              autoFocus={!editando}
              placeholder="00.000.000/0000-00"
              onChange={(e) => {
                setDocumento(mascaraDocumento(e.target.value));
                setSituacao(null);
              }}
            />
            <Botao icone={buscando ? 'sincronizar' : 'busca'} onClick={buscarCnpj} disabled={!podeBuscar || buscando}>
              {buscando ? 'Buscando…' : 'Buscar'}
            </Botao>
          </div>
        </Campo>
        {situacao && (
          <div className={`aviso-caixa ${situacao === 'ATIVA' ? 'aviso-caixa--ok' : 'aviso-caixa--atencao'}`}>
            <Icone nome="predio" />
            <span>
              Situação na Receita: <CarimboTexto variante={situacao === 'ATIVA' ? 'pago' : 'vencido'}>{situacao}</CarimboTexto>
            </span>
          </div>
        )}

        <Campo rotulo={docNorm.length === 11 ? 'Nome completo' : 'Razão social'} htmlFor="c-nome" erro={tentou && !nome.trim() ? 'Informe o nome.' : null}>
          <Entrada id="c-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="Nome fantasia (como vocês chamam)" htmlFor="c-fant">
          <Entrada id="c-fant" value={fantasia} onChange={(e) => setFantasia(e.target.value)} />
        </Campo>
        <Campo className="c3" rotulo="E-mail" htmlFor="c-email">
          <Entrada id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo className="c3" rotulo="Telefone" htmlFor="c-tel">
          <Entrada id="c-tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
        </Campo>
        <Campo className="c2" rotulo="CEP" htmlFor="c-cep">
          <Entrada id="c-cep" inputMode="numeric" value={cep} onChange={(e) => setCep(mascaraCep(e.target.value))} onBlur={aoSairCep} />
        </Campo>
        <Campo className="c4" rotulo="Endereço" htmlFor="c-end">
          <Entrada id="c-end" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
        </Campo>
        <Campo className="c4 m3" rotulo="Cidade" htmlFor="c-cid">
          <Entrada id="c-cid" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </Campo>
        <Campo className="c2 m3" rotulo="UF" htmlFor="c-uf">
          <Selecao id="c-uf" value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">UF</option>
            {UFS.map((u) => (
              <option key={u.sigla} value={u.sigla}>
                {u.sigla}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo rotulo="Observações" htmlFor="c-obs">
          <AreaTexto id="c-obs" rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </Campo>
        <button type="submit" hidden />
      </form>
    </Camada>
  );
}
