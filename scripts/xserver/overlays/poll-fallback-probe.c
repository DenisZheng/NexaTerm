/* Exercise the actual fallback archive with one native loopback UDP socket. */
#include <dix-config.h>
#include "xserver_poll.h"
#include <limits.h>

int main(void)
{
    WSADATA startup;
    SOCKET receiver = INVALID_SOCKET, sender = INVALID_SOCKET;
    struct sockaddr_in address = {0};
    struct pollfd item;
    int length = sizeof(address), result = 1;
    char byte;
    if (WSAStartup((WORD)0x0202, &startup))
        return result;
    receiver = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    sender = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (receiver == INVALID_SOCKET || sender == INVALID_SOCKET || receiver > (SOCKET)INT_MAX)
        goto cleanup;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(receiver, (const struct sockaddr *)&address, sizeof(address)) ||
        getsockname(receiver, (struct sockaddr *)&address, &length))
        goto cleanup;
    item.fd = (int)receiver;
    item.events = POLLIN;
    item.revents = 0;
    if (xserver_poll(&item, 1, 0) != 0 || item.revents)
        goto cleanup;
    if (sendto(sender, "x", 1, 0, (const struct sockaddr *)&address, sizeof(address)) != 1)
        goto cleanup;
    if (xserver_poll(&item, 1, 2000) != 1 || !(item.revents & POLLIN))
        goto cleanup;
    if (recv(receiver, &byte, 1, 0) != 1 || byte != 'x')
        goto cleanup;
    if (xserver_poll(&item, 1, 0) != 0 || item.revents)
        goto cleanup;
    result = 0;
cleanup:
    if (receiver != INVALID_SOCKET && closesocket(receiver))
        result = 1;
    if (sender != INVALID_SOCKET && closesocket(sender))
        result = 1;
    if (WSACleanup())
        result = 1;
    return result;
}
