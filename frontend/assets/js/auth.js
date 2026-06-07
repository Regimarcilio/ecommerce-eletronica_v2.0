const API_URL = '/api';

const Auth = {
    getToken: () => localStorage.getItem('token'),
    setToken: (token) => token ? localStorage.setItem('token', token) : localStorage.removeItem('token'),
    getUser: () => {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },
    setUser: (user) => user ? localStorage.setItem('user', JSON.stringify(user)) : localStorage.removeItem('user'),
    isAuthenticated: () => !!Auth.getToken(),
    logout: () => {
        Auth.setToken(null);
        Auth.setUser(null);
        window.location.href = '/';
    }
};

function updateAuthUI() {
    const authContainer = document.getElementById('authContainer');
    const user = Auth.getUser();
    if (!authContainer) return;
    
    if (user) {
        authContainer.innerHTML = `
            <div class="dropdown">
                <button class="btn btn-outline-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
                    <i class="bi bi-person-circle"></i> ${user.nome.split(' ')[0]}
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="/minha-conta.html">Minha Conta</a></li>
                    ${user.role === 'admin' ? '<li><a class="dropdown-item" href="/dashboard.html">Dashboard Admin</a></li>' : ''}
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" onclick="Auth.logout()">Sair</a></li>
                </ul>
            </div>
        `;
    } else {
        authContainer.innerHTML = `<a href="/auth.html" class="btn btn-primary-custom">Entrar / Cadastrar</a>`;
    }
}

document.addEventListener('DOMContentLoaded', updateAuthUI);
