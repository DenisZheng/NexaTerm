/* Exercise the actual target library's descriptor-backed read/write callbacks. */
#include <stdio.h>
#include <string.h>
#include <X11/fonts/bufio.h>

int main(void)
{
    static const char payload[] = "WF09 font descriptor\r\n\x1a\x00\xff";
    char actual[sizeof(payload)];
    BufFilePtr writer = NULL, reader = NULL;
    FILE *file = fopen("font-buffer-probe.tmp", "w+b");
    int result = 1;
    if (!file)
        return result;
    writer = BufFileOpenWrite(fileno(file));
    if (!writer || BufFileWrite(writer, payload, sizeof(payload)) != (int)sizeof(payload))
        goto cleanup;
    /* This existing close callback returns the EOF flush marker; bytes below
       distinguish an actual successful flush from a failed write. */
    if (BufFileClose(writer, 0) != BUFFILEEOF) {
        writer = NULL;
        goto cleanup;
    }
    writer = NULL;
    if (fseek(file, 0, SEEK_SET))
        goto cleanup;
    reader = BufFileOpenRead(fileno(file));
    if (!reader || BufFileRead(reader, actual, sizeof(actual)) != (int)sizeof(actual) ||
        memcmp(actual, payload, sizeof(payload)) || BufFileRead(reader, actual, 1) != 0)
        goto cleanup;
    if (BufFileClose(reader, 0) != 1) {
        reader = NULL;
        goto cleanup;
    }
    reader = NULL;
    result = 0;
cleanup:
    if (writer)
        BufFileClose(writer, 0);
    if (reader)
        BufFileClose(reader, 0);
    if (fclose(file))
        result = 1;
    if (remove("font-buffer-probe.tmp"))
        result = 1;
    return result;
}
