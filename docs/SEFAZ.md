# Integração com a SEFAZ — plano técnico

> Resumo: na V1 o Prumo **lê XML de NF-e, valida chaves e simula a caixa de entrada da SEFAZ**. A integração real precisa de um servidor com o **certificado digital A1** da empresa; ela entra na V2. Este documento descreve o caminho. Confirme detalhes de legislação e prazos com o contador e com as notas técnicas vigentes do Portal Nacional da NF-e.

## Por que não dá para fazer só no navegador

1. Os web services da SEFAZ exigem **TLS mútuo**: a conexão é autenticada com o certificado digital (e-CNPJ) da empresa.
2. Os serviços são SOAP/XML **sem CORS** — o navegador bloqueia a chamada.
3. O certificado A1 (arquivo `.pfx` + senha) **não pode ficar no navegador**: quem tem o arquivo assina documentos em nome da empresa.

Logo: um **backend** guarda o certificado criptografado e conversa com a SEFAZ; o Prumo (frontend) conversa com esse backend.

## O que já existe na V1

| Recurso | Onde |
|---|---|
| Leitura do XML (NF-e/NFC-e, layout 4.00; aceita `nfeProc` e `NFe`) | `src/lib/nfe/parser.ts` |
| Validação e decomposição da chave de acesso (inclui CNPJ alfanumérico) | `src/lib/nfe/chave.ts` |
| Importação: cadastra contato, gera títulos pelas duplicatas, bloqueia repetida | `src/data/actions.ts` (`importarNotas`) |
| Caixa de entrada com manifestação (simulada) | `src/pages/Notas.tsx`, `src/services/sefaz.ts` |
| Interface do provedor | `ProvedorSefaz` em `src/services/sefaz.ts` |

Para ligar a integração real basta uma nova implementação de `ProvedorSefaz` que chame o backend.

## Serviços da SEFAZ que importam para o Prumo

| Necessidade | Serviço | Observações |
|---|---|---|
| Receber as NF-e emitidas **contra o CNPJ** | **NFeDistribuicaoDFe** (Ambiente Nacional) | Consulta incremental por **NSU** (`distNSU` / `ultNSU`). Retorna resumos (`resNFe`), eventos e, após a manifestação, o XML completo (`procNFe`), compactados (gzip + base64). Respeitar o intervalo entre consultas quando não houver documentos novos para não ser bloqueado por consumo indevido. |
| Manifestação do destinatário | **NFeRecepcaoEvento** (Ambiente Nacional) | Eventos: **210210** Ciência da Operação · **210200** Confirmação da Operação · **210220** Desconhecimento da Operação · **210240** Operação não Realizada. Evento assinado com o certificado. A ciência libera o download do XML completo; os eventos conclusivos têm prazo legal. |
| Situação de uma nota | **NFeConsultaProtocolo** (SEFAZ autorizadora da UF) | Confere se está autorizada/cancelada antes de pagar. |
| Notas de serviço (NFS-e) | **NFS-e padrão nacional** (ADN / Emissor Nacional) | API REST própria; entra na V3. |

## Caminho A — backend próprio com certificado A1

```
Prumo (navegador) ──HTTPS──▶ API Prumo ──TLS mútuo (A1)──▶ SEFAZ / Ambiente Nacional
                                 │
                                 ├─ cofre: .pfx criptografado (KMS) + senha
                                 ├─ fila: sincronização periódica por NSU (por empresa)
                                 └─ banco: notas, XML original, eventos, NSU por empresa
```

Passos:
1. Upload do `.pfx` + senha na tela **Configurações → SEFAZ** (já desenhada), enviado só ao backend; armazenar criptografado (ex.: KMS do provedor de nuvem), nunca em log.
2. Job de sincronização por empresa: chama `NFeDistribuicaoDFe` a partir do último NSU, salva resumos/XMLs, atualiza o NSU, agenda a próxima consulta respeitando o intervalo.
3. Ao “Dar ciência e importar”: envia o evento 210210, aguarda o XML completo na próxima distribuição, chama `importarNotas()`.
4. Avisar quando o certificado estiver perto de vencer (A1 vale 1 ano).

Bibliotecas úteis em Node: assinatura XML (xml-crypto), leitura de PFX (node-forge), cliente SOAP ou montagem manual do envelope, `zlib` para descompactar o `docZip`. Endpoints de homologação e produção por UF estão no Portal Nacional da NF-e.

**Prós:** custo marginal baixo, controle total. **Contras:** mais código para manter, acompanhar notas técnicas.

## Caminho B — provedor de API fiscal

Serviços como **Nuvem Fiscal, Focus NFe, PlugNotas (TecnoSpeed), NFE.io** e similares oferecem REST pronto para distribuição DF-e, manifestação, consulta e NFS-e. O certificado é enviado ao provedor.

**Prós:** chega ao mercado em semanas. **Contras:** custo por documento/empresa, dependência de terceiro.

**Recomendação:** começar a V2 pelo **caminho B** (validar com clientes reais rapidamente) mantendo a interface `ProvedorSefaz`; migrar para o **caminho A** quando o volume justificar.

## Cuidados

- Ambientes separados: **homologação** para testes, **produção** para valer (a configuração já existe em `configSefaz.ambiente`).
- Guardar o **XML original** (é o documento fiscal; o DANFE é só a representação).
- Trilha de auditoria de cada manifestação (quem, quando, qual evento) — o Prumo já registra atividades.
- Reforma tributária: as NF-e passam a trazer campos de IBS/CBS; o leitor deve preservá-los e o DRE pode exibi-los.
