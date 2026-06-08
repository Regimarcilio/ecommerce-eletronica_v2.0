window.editarProduto = async function(id) {
    try {
        console.log('Editando produto ID:', id);
        showToast('Carregando dados do produto...');
        
        const res = await fetch(`${API}/produtos/${id}`);
        console.log('Resposta status:', res.status);
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        console.log('Dados recebidos:', data);
        
        if (data.success && data.produto) {
            window.abrirModalProduto(data.produto);
            showToast('Dados carregados!');
        } else {
            showToast('Erro: ' + (data.message || 'Produto não encontrado'), true);
        }
    } catch(e) {
        console.error('Erro detalhado:', e);
        showToast('Erro ao carregar produto: ' + e.message, true);
    }
};
