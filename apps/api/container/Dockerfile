# Image des runners : de quoi cloner un dépôt, faire travailler l'agent de code, installer
# les dépendances et lancer tests et preview.
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates python3 python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
# Agent de code (https://aider.chat), version figée pour des exécutions reproductibles.
RUN python3 -m venv /opt/aider \
  && /opt/aider/bin/pip install --no-cache-dir aider-chat==0.86.2 \
  && ln -s /opt/aider/bin/aider /usr/local/bin/aider
RUN useradd --create-home --shell /bin/bash runner && mkdir /workspace && chown runner /workspace
USER runner
WORKDIR /workspace
# Le conteneur reste vivant ; le Durable Object y exécute les commandes.
CMD ["sleep", "infinity"]
