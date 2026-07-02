/*
 * Portão de senha simples para o painel.
 * Proteção client-side: adequada para desencorajar acesso casual em uma
 * página estática (GitHub Pages). Não é segurança real — qualquer pessoa
 * com acesso ao código-fonte pode contornar. Para dados sensíveis, use um
 * repositório privado ou um proxy com autenticação de verdade.
 *
 * Para trocar a senha: gere um novo hash SHA-256 (ex: no console do
 * navegador rode `await sha256("novaSenha")` com a função abaixo) e
 * substitua o valor de SENHA_HASH.
 */
const SENHA_HASH = '607e635aa1d4c6efa2d41cd65ab15806d5205df5783b17dd678b6d55042632ba'; // senha padrão: viva2026
const SESSION_KEY = 'painel-viva-auth';

async function sha256(texto) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showApp() {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('app').classList.add('on');
    document.dispatchEvent(new CustomEvent('painel:unlocked'));
}

async function tentarEntrar() {
    const input = document.getElementById('gateInput');
    const err = document.getElementById('gateErr');
    const hash = await sha256(input.value.trim());
    if (hash === SENHA_HASH) {
        sessionStorage.setItem(SESSION_KEY, '1');
        showApp();
    } else {
        err.textContent = 'Senha incorreta.';
        input.value = '';
        input.focus();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
        showApp();
        return;
    }
    const btn = document.getElementById('gateBtn');
    const input = document.getElementById('gateInput');
    btn.addEventListener('click', tentarEntrar);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tentarEntrar(); });
    input.focus();
});
