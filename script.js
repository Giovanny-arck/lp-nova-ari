document.addEventListener('DOMContentLoaded', () => {
    
    // --- URLs DOS WEBHOOKS (SUBSTITUA PELOS SEUS) ---
    const WEBHOOK_URL_1 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto';
    const WEBHOOK_URL_2 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto-rdmkt';

    // --- FORMULÁRIO DA HERO SECTION (UTMs e Webhook) ---
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', handleFormSubmit);
    }

    function getUtmParams() {
        const params = new URLSearchParams(window.location.search);
        const utm = {};
        for (const [key, value] of params.entries()) {
            if (key.startsWith('utm_')) {
                utm[key] = value;
            }
        }
        return utm;
    }

    // --- GERA UM ID ÚNICO PARA O EVENTO ---
    function generateEventId() {
        return 'evt_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        const formStatus = document.getElementById('form-status');
        const submitButton = contactForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'ENVIANDO...';
        formStatus.textContent = '';
        formStatus.className = '';

        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());
        
        // --- FORMATAÇÃO DO TELEFONE ---
        // Pega o número de telefone do formulário
        let formattedPhone = data.whatsapp || '';
        // 1. Remove tudo que não for dígito (como "(", ")", "-", " ")
        formattedPhone = formattedPhone.replace(/\D/g, '');
        // 2. Remove o "55" do início, se o usuário já tiver digitado, para evitar duplicidade
        if (formattedPhone.startsWith('55')) {
            formattedPhone = formattedPhone.substring(2);
        }
        // 3. Adiciona o prefixo +55 ao número limpo
        formattedPhone = '+55' + formattedPhone;
        // --- FIM DA FORMATAÇÃO ---

        const payload = {
            ...data,
            whatsapp: formattedPhone, // Substitui o whatsapp original pelo formatado
            utms: getUtmParams(),
            submittedAt: new Date().toISOString()
        };

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        try {
            const [result1, result2] = await Promise.allSettled([
                fetch(WEBHOOK_URL_1, requestOptions),
                fetch(WEBHOOK_URL_2, requestOptions)
            ]);

            const isSuccess = (result1.status === 'fulfilled' && result1.value.ok) || 
                              (result2.status === 'fulfilled' && result2.value.ok);

            if (isSuccess) {
                formStatus.textContent = 'Dados enviados com sucesso!';
                formStatus.className = 'success';
                contactForm.reset();

                // --- DISPARO DO PIXEL DA META ---
                if (typeof fbq === 'function') {
                    // Evento Lead
                    fbq('track', 'Lead', {
                        name: data.nome || '',
                        email: data.email || '',
                        phone: data.whatsapp || '',
                        utm_source: payload.utms.utm_source || ''
                    });
                    console.log("Evento Meta Pixel 'Lead' disparado");

                    // Evento CompleteRegistration com eventID
                    const eventId = generateEventId();
                    fbq('track', 'CompleteRegistration', {}, { eventID: eventId });
                    console.log("Evento Meta Pixel 'CompleteRegistration' disparado com eventID:", eventId);
                }
            } else {
                throw new Error('Falha no envio para ambos os webhooks.');
            }
        } catch (error) {
            console.error('Erro ao enviar formulário:', error);
            formStatus.textContent = 'Erro ao enviar. Tente novamente.';
            formStatus.className = 'error';
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'QUERO ME REGISTRAR';
        }
    }


    // --- LÓGICA DA CALCULADORA SIMPLIFICADA ---
    const valorInput = document.getElementById('valor-aplicado');
    const formaBtns = document.querySelectorAll('.forma-btn');
    const tempoBtns = document.querySelectorAll('.tempo-btn');
    const valorError = document.getElementById('valor-error');
    const valleResultLabel = document.getElementById('valle-result-label');
    const valleResultDisplay = document.getElementById('valle-result');

    let formaSelecionada = 'final';
    let mesesSelecionados = 0;

    const taxaPrazo = {
        18: { mensal: 0.015, final: 0.015 }, 24: { mensal: 0.016, final: 0.016 }, 36: { mensal: 0.018, final: 0.018 }
    };
    const taxaExtra = [
        { min: 50000, max: 99999.99, extra: 0.000 }, { min: 100000, max: 199999.99, extra: 0.003 },
        { min: 200000, max: 399999.99, extra: 0.005 }, { min: 400000, max: Infinity, extra: 0.007 }
    ];
    const taxaAdicionalFinal = 0.005;
    const valorMinimo = 50000;

    function formatarMoeda(valor) {
        if (isNaN(valor) || valor < 0) return 'R$ 0,00';
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function obterTaxaExtraPorValor(valor) {
        return taxaExtra.find(f => valor >= f.min && valor <= f.max)?.extra || 0;
    }

    function calcularSimulacao() {
        const valorStr = valorInput.value.replace(/\./g, '').replace(',', '.');
        const valor = parseFloat(valorStr) || 0;
        
        if (valor > 0 && valor < valorMinimo) {
            valorError.style.display = 'block';
            resetarResultados();
            return;
        } else {
            valorError.style.display = 'none';
        }

        if (valor < valorMinimo || mesesSelecionados === 0) {
            resetarResultados();
            return;
        }

        let resultadoValle;
        const taxaExtraValor = obterTaxaExtraPorValor(valor);

        if (formaSelecionada === 'final') {
            valleResultLabel.textContent = 'Valorização Total no Final do Período:';
            const taxaBase = taxaPrazo[mesesSelecionados].final;
            const taxaTotalMensalValle = taxaBase + taxaAdicionalFinal + taxaExtraValor;
            resultadoValle = (valor * taxaTotalMensalValle) * mesesSelecionados;
        } else { // mensal
            valleResultLabel.textContent = 'Rendimento Mensal Estimado:';
            const taxaBase = taxaPrazo[mesesSelecionados].mensal;
            const taxaTotalMensalValle = taxaBase + taxaExtraValor;
            resultadoValle = valor * taxaTotalMensalValle;
        }
        
        valleResultDisplay.textContent = formatarMoeda(resultadoValle);
    }
    
    function resetarResultados() {
        valleResultDisplay.textContent = 'R$ 0,00';
    }
    
    valorInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        e.target.value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
        calcularSimulacao();
    });

    formaBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            formaBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            formaSelecionada = btn.dataset.forma;
            calcularSimulacao();
        });
    });

    tempoBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tempoBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            mesesSelecionados = parseInt(btn.dataset.meses);
            calcularSimulacao();
        });
    });

    // --- LÓGICA DO ACORDEÃO ---
    const accordions = document.querySelectorAll('.accordion');
    accordions.forEach(accordion => {
        const items = accordion.querySelectorAll('.accordion-item');
        items.forEach(item => {
            const header = item.querySelector('.accordion-header');
            header.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                
                const parentAccordion = header.closest('.accordion');
                parentAccordion.querySelectorAll('.accordion-item').forEach(otherItem => {
                    otherItem.classList.remove('active');
                    otherItem.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
                });

                if (!isActive) {
                    item.classList.add('active');
                    header.setAttribute('aria-expanded', 'true');
                }
            });
        });
    });
});
