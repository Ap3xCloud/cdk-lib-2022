FROM alpine:latest

ARG SERVER_BINARY_URL

RUN apk update &&\
    apk upgrade &&\
    apk add libc6-compat python3 jq dos2unix ca-certificates --no-cache &&\
    rm -rf /var/cache/apk/* /root/.cache/* /usr/share/terminfo &&\
    update-ca-certificates 2>/dev/null || true

USER root
WORKDIR /root

ADD ${SERVER_BINARY_URL:-./server} server
ADD https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem rds-combined-ca-bundle.pem
ADD run.sh .
RUN chmod +x run.sh && \
    dos2unix run.sh && \
    apk --purge -v del dos2unix && rm -rf /var/cache/apk/* /root/.cache/* /usr/share/terminfo

CMD ["sh", "run.sh"]