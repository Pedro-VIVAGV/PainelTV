#!/usr/bin/env node
/*
 * Sincroniza [DB] Tarefas Gerais e [DB] Eventos Gerais do Notion e gera
 * data/dados.json, consumido pelo painel estático (index.html).
 *
 * Uso:
 *   NOTION_TOKEN=secret_xxx node scripts/sync-notion.mjs
 *
 * O token precisa ser de uma integração interna do Notion
 * (https://www.notion.so/my-integrations) com acesso de leitura
 * compartilhado nas duas databases abaixo (menu "..." > Conectar a > escolher a integração).
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DADOS_PATH = path.join(DATA_DIR, 'dados.json');
const HISTORICO_PATH = path.join(DATA_DIR, 'historico.json');

const DB_TAREFAS = 'ffc3e27f-a5f6-427c-8d1a-e89bb23ce35e';
const DB_EVENTOS = '84cc1af3-50fe-4940-bbad-712025a2b3fc';
// Opções fixas do campo "Setor" em [DB] Tarefas Gerais — mantidas mesmo com 0 tarefas
const SETORES_CONHECIDOS = ['Marketing', 'Produção', 'Cotação', 'Atendimento', 'Comercial', 'Diretoria', 'Planejamento'];
const NOTION_VERSION = '2022-06-28';
const TOKEN = process.env.NOTION_TOKEN;
const TZ = 'America/Sao_Paulo';

if (!TOKEN) {
    console.error('Erro: defina a variável de ambiente NOTION_TOKEN com o token da integração do Notion.');
    process.exit(1);
}

async function queryDatabase(databaseId) {
    const results = [];
    let cursor = undefined;
    do {
        const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Notion-Version': NOTION_VERSION,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Notion API ${res.status} ao consultar ${databaseId}: ${body}`);
        }
        const json = await res.json();
        results.push(...json.results);
        cursor = json.has_more ? json.next_cursor : undefined;
    } while (cursor);
    return results;
}

// ── Helpers de data (fuso America/Sao_Paulo, comparação por dia) ─────────
function hojeISO() {
    return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}

function diasEntre(isoA, isoB) {
    const a = new Date(isoA + 'T00:00:00');
    const b = new Date(isoB + 'T00:00:00');
    return Math.round((b - a) / 86400000);
}

function inicioSemana(iso) {
    const d = new Date(iso + 'T00:00:00');
    const dow = d.getDay(); // 0=domingo
    const offset = dow === 0 ? -6 : 1 - dow; // segunda-feira
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
}

function addDias(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

// ── Extração de propriedades do Notion ────────────────────────────────
function getTitulo(prop) {
    return (prop?.title || []).map(t => t.plain_text).join('').trim();
}
function getData(prop) {
    return prop?.date?.start ? prop.date.start.slice(0, 10) : null;
}
function getStatus(prop) {
    return prop?.status?.name || null;
}
function getSelect(prop) {
    return prop?.select?.name || null;
}
function getMultiSelect(prop) {
    return (prop?.multi_select || []).map(o => o.name);
}
function getPessoas(prop) {
    return (prop?.people || []).map(p => ({ id: p.id, name: p.name || null })).filter(p => p.id);
}
function getTexto(prop) {
    return (prop?.rich_text || []).map(t => t.plain_text).join('').trim();
}

// A API do Notion às vezes omite o nome de um usuário no payload da página
// (comum para convidados/contas sem acesso pleno da integração). Nesses
// casos, resolvemos o nome com uma chamada dedicada a /v1/users/{id}.
async function resolverNomesFaltantes(idsFaltantes) {
    const nomes = new Map();
    for (const id of idsFaltantes) {
        try {
            const res = await fetch(`https://api.notion.com/v1/users/${id}`, {
                headers: { 'Authorization': `Bearer ${TOKEN}`, 'Notion-Version': NOTION_VERSION },
            });
            if (res.ok) {
                const user = await res.json();
                nomes.set(id, user.name || user.person?.email || `Usuário ${id.slice(0, 8)}`);
            } else {
                nomes.set(id, `Usuário ${id.slice(0, 8)}`);
            }
        } catch {
            nomes.set(id, `Usuário ${id.slice(0, 8)}`);
        }
    }
    return nomes;
}

async function carregarHistorico() {
    try {
        return JSON.parse(await readFile(HISTORICO_PATH, 'utf-8'));
    } catch {
        return { pessoas: {}, setores: {} };
    }
}

async function main() {
    const hoje = hojeISO();
    const semanaInicio = inicioSemana(hoje);
    const semanaFim = addDias(semanaInicio, 6);
    const mesAtual = hoje.slice(0, 7); // YYYY-MM

    console.log(`Sincronizando Notion (hoje=${hoje}, semana=${semanaInicio}..${semanaFim})...`);

    const [tarefasRaw, eventosRaw] = await Promise.all([
        queryDatabase(DB_TAREFAS),
        queryDatabase(DB_EVENTOS),
    ]);

    const tarefas = tarefasRaw.map(page => {
        const p = page.properties;
        return {
            nome: getTitulo(p['Nome da Tarefa']),
            status: getStatus(p['Status']),
            data: getData(p['Data']),
            prazoFinal: getData(p['Prazo Final']),
            responsaveis: getPessoas(p['Responsável']),
            setores: getMultiSelect(p['Setor']),
        };
    });

    const eventos = eventosRaw.map(page => {
        const p = page.properties;
        return {
            nome: getTitulo(p['Nome do Projeto']),
            categoria: getSelect(p['Categoria']),
            data: getData(p['Data Evento']),
            empresa: getSelect(p['Empresa Execução']),
            local: getTexto(p['Localização']),
        };
    });

    // Resolve nomes de usuários que vieram sem "name" no payload da tarefa
    const idsFaltantes = new Set();
    tarefas.forEach(t => t.responsaveis.forEach(pessoa => { if (!pessoa.name) idsFaltantes.add(pessoa.id); }));
    const nomesResolvidos = idsFaltantes.size ? await resolverNomesFaltantes(idsFaltantes) : new Map();
    const nomeDe = pessoa => pessoa.name || nomesResolvidos.get(pessoa.id) || `Usuário ${pessoa.id.slice(0, 8)}`;

    // ── Eventos: semana e mês ──────────────────────────────────────────
    const contarPorEmpresa = lista => lista.reduce((acc, e) => {
        acc[e.empresa || 'Outro'] = (acc[e.empresa || 'Outro'] || 0) + 1;
        return acc;
    }, {});

    const eventosSemanaLista = eventos
        .filter(e => e.data && e.data >= semanaInicio && e.data <= semanaFim)
        .sort((a, b) => a.data.localeCompare(b.data));
    const eventosMesLista = eventos.filter(e => e.data && e.data.slice(0, 7) === mesAtual);

    // ── Tarefas: atrasadas (prazo passado, não concluída) ──────────────
    const naoConcluida = t => t.status !== 'Concluído';
    const prazoRef = t => t.prazoFinal || t.data;
    const atrasadas = tarefas.filter(t => naoConcluida(t) && prazoRef(t) && prazoRef(t) < hoje);
    const semana = tarefas.filter(t => {
        const ref = prazoRef(t);
        return ref && ref >= semanaInicio && ref <= semanaFim;
    });

    const historico = await carregarHistorico();

    // ── Agrupamento por pessoa ──────────────────────────────────────────
    const pessoasMap = new Map();
    function getPessoa(nome) {
        if (!pessoasMap.has(nome)) {
            pessoasMap.set(nome, { nome, setores: new Set(), atrasadas: 0, semanaTotal: 0, tarefasAtrasadas: [], tarefasSemana: [] });
        }
        return pessoasMap.get(nome);
    }
    // Só usamos tarefas não concluídas para "descobrir" quem é uma pessoa
    // ativa (evita poluir os cards com gente que só tem tarefas antigas já
    // finalizadas).
    tarefas.filter(naoConcluida).forEach(t => t.responsaveis.forEach(pessoa => t.setores.forEach(s => getPessoa(nomeDe(pessoa)).setores.add(s))));
    atrasadas.forEach(t => t.responsaveis.forEach(pessoa => {
        const p = getPessoa(nomeDe(pessoa));
        p.atrasadas++;
        p.tarefasAtrasadas.push({ nome: t.nome, diasAtraso: diasEntre(prazoRef(t), hoje) });
    }));
    semana.forEach(t => t.responsaveis.forEach(pessoa => {
        const p = getPessoa(nomeDe(pessoa));
        p.semanaTotal++;
        p.tarefasSemana.push({ nome: t.nome, data: prazoRef(t) });
    }));

    // ── Agrupamento por setor ────────────────────────────────────────────
    const setoresMap = new Map();
    function getSetor(nome) {
        if (!setoresMap.has(nome)) {
            setoresMap.set(nome, { nome, pessoas: new Set(), atrasadas: 0, semanaTotal: 0, tarefasAtrasadas: [], tarefasSemana: [] });
        }
        return setoresMap.get(nome);
    }
    SETORES_CONHECIDOS.forEach(getSetor);
    tarefas.filter(naoConcluida).forEach(t => t.setores.forEach(s => t.responsaveis.forEach(pessoa => getSetor(s).pessoas.add(nomeDe(pessoa)))));
    atrasadas.forEach(t => t.setores.forEach(s => {
        const setor = getSetor(s);
        setor.atrasadas++;
        setor.tarefasAtrasadas.push({ nome: t.nome, diasAtraso: diasEntre(prazoRef(t), hoje) });
    }));
    semana.forEach(t => t.setores.forEach(s => {
        const setor = getSetor(s);
        setor.semanaTotal++;
        setor.tarefasSemana.push({ nome: t.nome, data: prazoRef(t) });
    }));

    const pessoas = Array.from(pessoasMap.values())
        // descarta contas cujo nome não pôde ser resolvido (ex.: usuário
        // removido do workspace) e que não têm nenhuma tarefa relevante
        .filter(p => !(p.nome.startsWith('Usuário ') && p.atrasadas === 0 && p.semanaTotal === 0))
        .map(p => ({
            nome: p.nome,
            setores: Array.from(p.setores),
            atrasadas: p.atrasadas,
            atrasadasAnterior: historico.pessoas[p.nome] ?? p.atrasadas,
            semanaTotal: p.semanaTotal,
            tarefasAtrasadas: p.tarefasAtrasadas.sort((a, b) => b.diasAtraso - a.diasAtraso),
            tarefasSemana: p.tarefasSemana.sort((a, b) => (a.data || '').localeCompare(b.data || '')),
        })).sort((a, b) => a.nome.localeCompare(b.nome));

    const setores = Array.from(setoresMap.values()).map(s => ({
        nome: s.nome,
        pessoas: Array.from(s.pessoas),
        atrasadas: s.atrasadas,
        atrasadasAnterior: historico.setores[s.nome] ?? s.atrasadas,
        semanaTotal: s.semanaTotal,
        tarefasAtrasadas: s.tarefasAtrasadas.sort((a, b) => b.diasAtraso - a.diasAtraso),
        tarefasSemana: s.tarefasSemana.sort((a, b) => (a.data || '').localeCompare(b.data || '')),
    })).sort((a, b) => a.nome.localeCompare(b.nome));

    const dados = {
        atualizadoEm: new Date().toISOString(),
        semana: { inicio: semanaInicio, fim: semanaFim },
        resumo: {
            eventosSemana: { total: eventosSemanaLista.length, porEmpresa: contarPorEmpresa(eventosSemanaLista) },
            eventosMes: { total: eventosMesLista.length, porEmpresa: contarPorEmpresa(eventosMesLista) },
            totalAtrasadas: atrasadas.length,
            totalAtrasadasAnterior: historico.totalAtrasadas ?? atrasadas.length,
            totalSemana: semana.length,
        },
        pessoas,
        setores,
        eventosSemanaLista: eventosSemanaLista.map(e => ({ nome: e.nome, data: e.data, empresa: e.empresa, categoria: e.categoria, local: e.local })),
    };

    const novoHistorico = {
        pessoas: Object.fromEntries(pessoas.map(p => [p.nome, p.atrasadas])),
        setores: Object.fromEntries(setores.map(s => [s.nome, s.atrasadas])),
        totalAtrasadas: atrasadas.length,
    };

    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DADOS_PATH, JSON.stringify(dados, null, 2));
    await writeFile(HISTORICO_PATH, JSON.stringify(novoHistorico, null, 2));

    console.log(`OK: ${tarefas.length} tarefas, ${eventos.length} eventos, ${atrasadas.length} atrasadas, ${semana.length} na semana.`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
