/* 原生构建验证：只解析数值回环地址，不建立网络连接。 */
#include <X11/Xwinsock.h>
#include <string.h>

int main(void)
{
    WSADATA data;
    struct addrinfo hints = {0}, *result = NULL;
    struct in6_addr address;
    char text[INET6_ADDRSTRLEN];
    socklen_t size = (socklen_t)sizeof(struct sockaddr_in6);
    int status = 1;

    if (WSAStartup(MAKEWORD(2, 2), &data) != 0)
        return 2;
    hints.ai_family = AF_INET6;
    hints.ai_socktype = SOCK_STREAM;
    hints.ai_flags = AI_NUMERICHOST | AI_NUMERICSERV;
    if (size <= 0 || inet_pton(AF_INET6, "::1", &address) != 1)
        goto done;
    if (!inet_ntop(AF_INET6, &address, text, sizeof(text)) || strcmp(text, "::1"))
        goto done;
    if (getaddrinfo("::1", "0", &hints, &result) != 0 || !result)
        goto done;
    status = result->ai_family == AF_INET6 ? 0 : 3;
done:
    if (result)
        freeaddrinfo(result);
    if (WSACleanup() != 0)
        status = 4;
    return status;
}
