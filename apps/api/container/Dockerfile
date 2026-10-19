# Image des runners : de quoi cloner un dépôt, installer ses dépendances et lancer tests et preview.
FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
RUN useradd --create-home --shell /bin/bash runner && mkdir /workspace && chown runner /workspace
USER runner
WORKDIR /workspace
# Le conteneur reste vivant ; le Durable Object y exécute les commandes.
CMD ["sleep", "infinity"]
