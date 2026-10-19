/* Declarations for the fixed upstream authorization implementation. */
#ifndef NEXATERM_XWIN_AUTH_H
#define NEXATERM_XWIN_AUTH_H

#include "win.h"
#include <xcb/xcb.h>

BOOL winGenerateAuthorization(void);
xcb_auth_info_t *winGetXcbAuthInfo(void);

#endif
