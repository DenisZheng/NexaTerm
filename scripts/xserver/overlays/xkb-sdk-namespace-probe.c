/* Exercise SDK parsing before private parser and diagnostic macros. */
#ifdef NEXATERM_XKB_BAD_ORDER
# define TypeString 4
# define ERROR compilerDiagnostic
#endif

#define WIN32_LEAN_AND_MEAN
#include <X11/Xwindows.h>

#ifndef NEXATERM_XKB_BAD_ORDER
# undef ERROR
# define TypeString 4
# define ERROR compilerDiagnostic
#endif

static unsigned diagnostics;

static void compilerDiagnostic(const char *message)
{
    if (message && message[0])
        ++diagnostics;
}

int main(void)
{
    if (TypeString != 4 || GetCurrentProcessId() == 0)
        return 2;
    ERROR("expected compiler diagnostic");
    return diagnostics == 1 ? 0 : 3;
}
