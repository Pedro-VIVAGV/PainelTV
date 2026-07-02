const DATA_URL = 'data/dados.json';
const REFRESH_MS = 5 * 60 * 1000; // recarrega os dados a cada 5 min
const CLOCK_MS = 1000;
const TAREFAS_VISIVEIS = 5; // quantas tarefas mostrar antes do botão "ver mais"
const SETORES_OCULTOS = ['Diretoria'];
const THEME_KEY = 'painel-viva-tema';

let STATE = {
    dados: null,
    filtroPessoa: 'todas',
    filtroSetor: 'todos',
    modo: 'pessoa-setor', // 'pessoa-setor' | 'pessoa' | 'setor'
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function fmtData(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}`;
}

function diaSemana(iso) {
    const dias = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    return dias[new Date(iso + 'T12:00:00').getDay()];
}

function semSetoresOcultos(lista) {
    return lista.filter(s => !SETORES_OCULTOS.includes(s.nome));
}

function empresaClass(nome) {
    return ['VIVA', 'Luminous', 'Triunfo'].includes(nome) ? `empresa-${nome}` : '';
}

// ── Relógio ──────────────────────────────────────────────
function tickClock() {
    const now = new Date();
    $('#clockTime').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    $('#clockDate').textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

// ── Tema claro/escuro ─────────────────────────────────────
function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    $('#themeBtn').textContent = tema === 'light' ? '☀' : '☾';
    localStorage.setItem(THEME_KEY, tema);
}
function initTema() {
    const salvo = localStorage.getItem(THEME_KEY) || 'dark';
    aplicarTema(salvo);
    $('#themeBtn').addEventListener('click', () => {
        const atual = document.documentElement.getAttribute('data-theme');
        aplicarTema(atual === 'light' ? 'dark' : 'light');
    });
}

// ── Carregamento de dados ────────────────────────────────
async function carregarDados() {
    try {
        const res = await fetch(DATA_URL + '?t=' + Date.now());
        if (!res.ok) throw new Error('falha ao carregar dados.json');
        STATE.dados = await res.json();
        popularFiltros();
        renderTudo();
        $('#syncDot').style.background = 'var(--green)';
        const dt = new Date(STATE.dados.atualizadoEm);
        $('#syncTxt').textContent = 'Atualizado às ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        console.error(e);
        $('#syncDot').style.background = 'var(--red)';
        $('#syncTxt').textContent = 'Falha ao atualizar dados';
    }
}

function popularFiltros() {
    const selPessoa = $('#filtroPessoa');
    const selSetor = $('#filtroSetor');
    if (selPessoa.dataset.filled) return;
    STATE.dados.pessoas.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nome; opt.textContent = p.nome;
        selPessoa.appendChild(opt);
    });
    semSetoresOcultos(STATE.dados.setores).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.nome; opt.textContent = s.nome;
        selSetor.appendChild(opt);
    });
    selPessoa.dataset.filled = '1';
}

// ── Render geral ─────────────────────────────────────────
function renderTudo() {
    if (!STATE.dados) return;
    renderVisaoGeral();
    renderAtrasadas();
    renderSemana();
}

function trendBadge(atual, anterior) {
    if (anterior === undefined || anterior === null || atual === anterior) {
        return `<span class="trend flat" title="Sem alteração desde a última mudança">— ${anterior ?? atual}</span>`;
    }
    if (atual > anterior) return `<span class="trend up" title="Subiu desde o último valor (era ${anterior})">▲ ${anterior}</span>`;
    return `<span class="trend down" title="Baixou desde o último valor (era ${anterior})">▼ ${anterior}</span>`;
}

// ── Aba: Visão Geral ─────────────────────────────────────
function renderVisaoGeral() {
    const d = STATE.dados;
    const wrap = $('#paneGeral');
    const empresasLine = obj => Object.entries(obj)
        .map(([k, v]) => `<b class="${empresaClass(k)}">${v} ${k}</b>`).join(', ');

    let html = `
    <div class="kpi-grid">
        <div class="kpi-card">
            <div class="kpi-cat">Eventos na semana</div>
            <div class="kpi-num">${d.resumo.eventosSemana.total}</div>
            <div class="kpi-desc">${empresasLine(d.resumo.eventosSemana.porEmpresa)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-cat">Eventos no mês</div>
            <div class="kpi-num">${d.resumo.eventosMes.total}</div>
            <div class="kpi-desc">${empresasLine(d.resumo.eventosMes.porEmpresa)}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-cat">Tarefas atrasadas</div>
            <div class="kpi-num${d.resumo.totalAtrasadas > 0 ? ' warn' : ''}">${d.resumo.totalAtrasadas}</div>
            <div class="kpi-desc">${trendBadge(d.resumo.totalAtrasadas, d.resumo.totalAtrasadasAnterior)} em relação à última atualização</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-cat">Atividades da semana</div>
            <div class="kpi-num">${d.resumo.totalSemana}</div>
            <div class="kpi-desc">Tarefas com prazo entre ${fmtData(d.semana.inicio)} e ${fmtData(d.semana.fim)}</div>
        </div>
    </div>

    <div class="section-title">Tarefas atrasadas por pessoa</div>
    <div class="card-grid">
        ${d.pessoas.slice().sort((a, b) => b.atrasadas - a.atrasadas).map(p => cardPessoaCompacto(p)).join('') || vazio('Nenhuma pessoa com tarefas.')}
    </div>`;

    wrap.innerHTML = html;
}

function cardPessoaCompacto(p) {
    return `
    <div class="p-card">
        <div class="p-card-top">
            <div>
                <div class="p-name">${p.nome}</div>
                <div class="p-tags">${p.setores.filter(s => !SETORES_OCULTOS.includes(s)).map(s => `<span class="p-tag">${s}</span>`).join('')}</div>
            </div>
        </div>
        <div class="p-num-row">
            <div class="p-num ${p.atrasadas === 0 ? 'zero' : 'warn'}">${p.atrasadas}</div>
            ${trendBadge(p.atrasadas, p.atrasadasAnterior)}
        </div>
    </div>`;
}

function vazio(msg) {
    return `<div class="empty-state"><div class="ico">✓</div><p>${msg}</p></div>`;
}

// ── Aba: Atrasadas ───────────────────────────────────────
function renderAtrasadas() {
    const d = STATE.dados;
    const wrap = $('#paneAtrasadas');
    let pessoas = d.pessoas.filter(p => STATE.filtroPessoa === 'todas' || p.nome === STATE.filtroPessoa);
    let setores = semSetoresOcultos(d.setores).filter(s => STATE.filtroSetor === 'todos' || s.nome === STATE.filtroSetor);
    if (STATE.filtroSetor !== 'todos') pessoas = pessoas.filter(p => p.setores.includes(STATE.filtroSetor));
    if (STATE.filtroPessoa !== 'todas') setores = setores.filter(s => s.pessoas.includes(STATE.filtroPessoa));

    pessoas = pessoas.slice().sort((a, b) => b.atrasadas - a.atrasadas);
    setores = setores.slice().sort((a, b) => b.atrasadas - a.atrasadas);

    let html = '';
    if (STATE.modo !== 'setor') {
        html += `<div class="section-title">Por pessoa</div><div class="card-grid">`;
        html += pessoas.length ? pessoas.map(p => cardDetalhado(p.nome, p.setores.filter(s => !SETORES_OCULTOS.includes(s)).join(', '), p.atrasadas, p.atrasadasAnterior, p.tarefasAtrasadas, 'prazo')).join('') : vazio('Ninguém com tarefas atrasadas 🎉');
        html += `</div>`;
    }
    if (STATE.modo !== 'pessoa') {
        html += `<div class="section-title">Por setor</div><div class="card-grid">`;
        html += setores.length ? setores.map(s => cardDetalhado(s.nome, '', s.atrasadas, s.atrasadasAnterior, s.tarefasAtrasadas, 'prazo')).join('') : vazio('Nenhum setor com tarefas atrasadas 🎉');
        html += `</div>`;
    }
    wrap.innerHTML = html;
}

function renderListaTarefas(tarefas, campoData) {
    return (tarefas || []).map((t, i) => `
        <div class="task-row${i >= TAREFAS_VISIVEIS ? ' hidden-extra' : ''}">
            <span class="task-name">${t.nome}</span>
            <span class="task-days">${t.diasAtraso != null ? t.diasAtraso + 'd atraso' : fmtData(t[campoData])}</span>
        </div>`).join('');
}

function botaoVerMais(total) {
    if (total <= TAREFAS_VISIVEIS) return '';
    return `<button class="task-toggle" data-total="${total}">Ver mais ${total - TAREFAS_VISIVEIS}</button>`;
}

function cardDetalhado(titulo, subtitulo, num, anterior, tarefas, campoData) {
    return `
    <div class="p-card">
        <div class="p-card-top">
            <div>
                <div class="p-name">${titulo}</div>
                ${subtitulo ? `<div class="p-tags"><span class="p-tag">${subtitulo}</span></div>` : ''}
            </div>
        </div>
        <div class="p-num-row">
            <div class="p-num ${num === 0 ? 'zero' : 'warn'}">${num}</div>
            ${trendBadge(num, anterior)}
        </div>
        <div class="task-list">${renderListaTarefas(tarefas, campoData)}</div>
        ${botaoVerMais((tarefas || []).length)}
    </div>`;
}

// ── Aba: Semana ───────────────────────────────────────────
function renderSemana() {
    const d = STATE.dados;
    const wrap = $('#paneSemana');
    let pessoas = d.pessoas.filter(p => STATE.filtroPessoa === 'todas' || p.nome === STATE.filtroPessoa);
    let setores = semSetoresOcultos(d.setores).filter(s => STATE.filtroSetor === 'todos' || s.nome === STATE.filtroSetor);
    if (STATE.filtroSetor !== 'todos') pessoas = pessoas.filter(p => p.setores.includes(STATE.filtroSetor));
    if (STATE.filtroPessoa !== 'todas') setores = setores.filter(s => s.pessoas.includes(STATE.filtroPessoa));

    pessoas = pessoas.slice().sort((a, b) => b.semanaTotal - a.semanaTotal);
    setores = setores.slice().sort((a, b) => b.semanaTotal - a.semanaTotal);

    let html = `<div class="section-title">Eventos da semana (${fmtData(d.semana.inicio)} — ${fmtData(d.semana.fim)})</div>`;
    html += d.eventosSemanaLista.length
        ? d.eventosSemanaLista.map(ev => `
            <div class="event-row">
                <div class="event-date">${diaSemana(ev.data)}<span>${fmtData(ev.data)}</span></div>
                <div class="event-info">
                    <div class="event-name">${ev.nome}</div>
                    <div class="event-meta">${ev.categoria || ''}${ev.local ? ' · ' + ev.local : ''}</div>
                </div>
                <div class="badge-empresa ${empresaClass(ev.empresa)}">${ev.empresa}</div>
            </div>`).join('')
        : vazio('Nenhum evento previsto para esta semana.');

    if (STATE.modo !== 'setor') {
        html += `<div class="section-title">Atividades por pessoa</div><div class="card-grid">`;
        html += pessoas.length ? pessoas.map(p => cardSemanaPessoa(p.nome, p.setores.filter(s => !SETORES_OCULTOS.includes(s)).join(', '), p.semanaTotal, p.tarefasSemana)).join('') : vazio('Sem atividades esta semana.');
        html += `</div>`;
    }
    if (STATE.modo !== 'pessoa') {
        html += `<div class="section-title">Atividades por setor</div><div class="card-grid">`;
        html += setores.length ? setores.map(s => cardSemanaPessoa(s.nome, '', s.semanaTotal, s.tarefasSemana)).join('') : vazio('Sem atividades esta semana.');
        html += `</div>`;
    }
    wrap.innerHTML = html;
}

function cardSemanaPessoa(titulo, subtitulo, num, tarefas) {
    const tasksHtml = (tarefas || []).map((t, i) => `
        <div class="task-row${i >= TAREFAS_VISIVEIS ? ' hidden-extra' : ''}">
            <span class="task-name">${t.nome}</span>
            <span class="task-days">${fmtData(t.data)}</span>
        </div>`).join('');
    return `
    <div class="p-card">
        <div class="p-card-top">
            <div>
                <div class="p-name">${titulo}</div>
                ${subtitulo ? `<div class="p-tags"><span class="p-tag">${subtitulo}</span></div>` : ''}
            </div>
        </div>
        <div class="p-num-row"><div class="p-num">${num}</div></div>
        <div class="task-list">${tasksHtml}</div>
        ${botaoVerMais((tarefas || []).length)}
    </div>`;
}

// ── Controles de UI ───────────────────────────────────────
function switchTab(id, btn) {
    $$('.tab-pane').forEach(el => el.classList.remove('active'));
    $$('.tab-btn').forEach(el => el.classList.remove('active'));
    $('#pane-' + id).classList.add('active');
    btn.classList.add('active');
    const filterBar = $('#filterBar');
    filterBar.style.display = (id === 'atrasadas' || id === 'semana') ? 'flex' : 'none';
}

function initControles() {
    $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn)));

    $$('.pill[data-modo]').forEach(btn => btn.addEventListener('click', () => {
        $$('.pill[data-modo]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        STATE.modo = btn.dataset.modo;
        renderAtrasadas();
        renderSemana();
    }));

    $('#filtroPessoa').addEventListener('change', e => {
        STATE.filtroPessoa = e.target.value;
        renderAtrasadas();
        renderSemana();
    });
    $('#filtroSetor').addEventListener('change', e => {
        STATE.filtroSetor = e.target.value;
        renderAtrasadas();
        renderSemana();
    });

    // Delegação para os botões "ver mais / ver menos" (o conteúdo é recriado a cada render)
    document.addEventListener('click', e => {
        const btn = e.target.closest('.task-toggle');
        if (!btn) return;
        const card = btn.closest('.p-card');
        const abrindo = !card.classList.contains('expanded');
        card.classList.toggle('expanded');
        const total = btn.dataset.total;
        btn.textContent = abrindo ? 'Ver menos' : `Ver mais ${total - TAREFAS_VISIVEIS}`;
    });
}

document.addEventListener('painel:unlocked', () => {
    initTema();
    initControles();
    tickClock();
    setInterval(tickClock, CLOCK_MS);
    carregarDados();
    setInterval(carregarDados, REFRESH_MS);
});
