/* Exercise the patched header's real Windows SDK interface and property key. */
#include <windows.h>
#include <string.h>
#include <wchar.h>
#define INITGUID
#include <initguid.h>
#include "propertystore.h"

static int calls;

static HRESULT STDMETHODCALLTYPE
set_value(IPropertyStore *self, REFPROPERTYKEY key, REFPROPVARIANT value)
{
    static const unsigned char tail[8] = {
        0xa8, 0xd0, 0xe1, 0xd4, 0x2d, 0xe1, 0xd5, 0xf3
    };
    ++calls;
    if (!self || key->fmtid.Data1 != 0x9f4c2855 ||
        key->fmtid.Data2 != 0x9f79 || key->fmtid.Data3 != 0x4b39 ||
        memcmp(key->fmtid.Data4, tail, sizeof(tail)) || key->pid != 5 ||
        value->vt != VT_LPWSTR ||
        wcscmp(value->pwszVal, L"nexaterm.wf09.probe"))
        return E_INVALIDARG;
    return S_OK;
}

int main(void)
{
    IPropertyStoreVtbl table = {0};
    IPropertyStore store;
    PROPVARIANT value = {0};
    table.SetValue = set_value;
    store.lpVtbl = &table;
    value.vt = VT_LPWSTR;
    value.pwszVal = L"nexaterm.wf09.probe";
    if (store.lpVtbl->SetValue(&store, &PKEY_AppUserModel_ID, &value) != S_OK)
        return 1;
    return calls == 1 ? 0 : 2;
}
