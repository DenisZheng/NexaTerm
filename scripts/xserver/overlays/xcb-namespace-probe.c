/* The XCB-first include order must retain separate SDK and protocol types. */
#include <xcb/xcb.h>
#include <X11/Xproto.h>
#include <X11/Xwinsock.h>

_Static_assert(sizeof(BOOL) == 1, "X11 protocol BOOL");
_Static_assert(sizeof(WINBOOL) == 4, "native Windows BOOL");
_Static_assert(sizeof(INT32) == 4, "X11 protocol INT32");
_Static_assert(sizeof(wINT32) == 4, "native Windows INT32");
_Static_assert(sizeof(wINT64) == 8, "native Windows INT64");
_Static_assert(sizeof(wLONG64) == 8, "native Windows LONG64");

int main(void)
{
    return 0;
}
