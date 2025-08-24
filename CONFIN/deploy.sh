#!/bin/bash

# Este script automatiza o deploy de alterações para o GitHub.
# Ele adiciona todos os arquivos, pede uma mensagem de commit e envia para o branch 'principal'.

# Garante que o script pare se algum comando falhar
set -e

echo "🚀 Iniciando o processo de deploy para o GitHub e Netlify..."
echo ""

# 1. Pergunta qual é a mensagem do commit
echo "💬 Por favor, digite a mensagem do commit (ex: 'Adiciona nova funcionalidade X'):"
read commit_message

# 2. Verifica se a mensagem não está vazia
if [ -z "$commit_message" ]; then
  echo "❌ Erro: A mensagem do commit não pode estar vazia."
  exit 1
fi

echo ""
echo "-----------------------------------------------------"

# 3. Executa os comandos Git
echo "📦 Adicionando todos os arquivos modificados (git add .)"
git add .

echo "💾 Salvando as alterações (git commit)"
git commit -m "$commit_message"

echo "📤 Enviando para o GitHub (git push origin principal)"
git push origin principal

echo "-----------------------------------------------------"
echo ""
echo "✅ Deploy finalizado com sucesso!"
echo "✨ O Netlify já foi notificado e deve iniciar a publicação em breve."