import{_ as a,c as s,o,ag as i}from"./chunks/framework.DPDPlp3K.js";const m=JSON.parse('{"title":"Class: ManagesPermissions","description":"","frontmatter":{"editLink":false,"search":false,"next":false,"prev":false},"headers":[],"relativePath":"api/soukai-solid/classes/ManagesPermissions.md","filePath":"api/soukai-solid/classes/ManagesPermissions.md"}'),r={name:"api/soukai-solid/classes/ManagesPermissions.md"};function t(n,e,c,l,d,h){return o(),s("div",null,e[0]||(e[0]=[i('<h1 id="class-managespermissions" tabindex="-1">Class: ManagesPermissions <a class="header-anchor" href="#class-managespermissions" aria-label="Permalink to &quot;Class: ManagesPermissions&quot;">​</a></h1><p>Defined in: <a href="https://github.com/NoelDeMartin/soukai/blob/408afa028026ad320095ca29531182ce5bfca702/packages/soukai-solid/src/models/mixins/ManagesPermissions.ts#L16" target="_blank" rel="noreferrer">packages/soukai-solid/src/models/mixins/ManagesPermissions.ts:16</a></p><h2 id="constructors" tabindex="-1">Constructors <a class="header-anchor" href="#constructors" aria-label="Permalink to &quot;Constructors&quot;">​</a></h2><h3 id="constructor" tabindex="-1">Constructor <a class="header-anchor" href="#constructor" aria-label="Permalink to &quot;Constructor&quot;">​</a></h3><blockquote><p><strong>new ManagesPermissions</strong>(): <code>ManagesPermissions</code></p></blockquote><h4 id="returns" tabindex="-1">Returns <a class="header-anchor" href="#returns" aria-label="Permalink to &quot;Returns&quot;">​</a></h4><p><code>ManagesPermissions</code></p><h2 id="properties" tabindex="-1">Properties <a class="header-anchor" href="#properties" aria-label="Permalink to &quot;Properties&quot;">​</a></h2><h3 id="publicpermissions" tabindex="-1">_publicPermissions <a class="header-anchor" href="#publicpermissions" aria-label="Permalink to &quot;\\_publicPermissions&quot;">​</a></h3><blockquote><p><code>protected</code> <strong>_publicPermissions</strong>: <code>undefined</code> | <code>SolidDocumentPermission</code>[]</p></blockquote><p>Defined in: <a href="https://github.com/NoelDeMartin/soukai/blob/408afa028026ad320095ca29531182ce5bfca702/packages/soukai-solid/src/models/mixins/ManagesPermissions.ts#L18" target="_blank" rel="noreferrer">packages/soukai-solid/src/models/mixins/ManagesPermissions.ts:18</a></p><h2 id="accessors" tabindex="-1">Accessors <a class="header-anchor" href="#accessors" aria-label="Permalink to &quot;Accessors&quot;">​</a></h2><h3 id="isprivate" tabindex="-1">isPrivate <a class="header-anchor" href="#isprivate" aria-label="Permalink to &quot;isPrivate&quot;">​</a></h3><h4 id="get-signature" tabindex="-1">Get Signature <a class="header-anchor" href="#get-signature" aria-label="Permalink to &quot;Get Signature&quot;">​</a></h4><blockquote><p><strong>get</strong> <strong>isPrivate</strong>(): <code>null</code> | <code>boolean</code></p></blockquote><p>Defined in: <a href="https://github.com/NoelDeMartin/soukai/blob/408afa028026ad320095ca29531182ce5bfca702/packages/soukai-solid/src/models/mixins/ManagesPermissions.ts#L24" target="_blank" rel="noreferrer">packages/soukai-solid/src/models/mixins/ManagesPermissions.ts:24</a></p><h5 id="returns-1" tabindex="-1">Returns <a class="header-anchor" href="#returns-1" aria-label="Permalink to &quot;Returns&quot;">​</a></h5><p><code>null</code> | <code>boolean</code></p><hr><h3 id="ispublic" tabindex="-1">isPublic <a class="header-anchor" href="#ispublic" aria-label="Permalink to &quot;isPublic&quot;">​</a></h3><h4 id="get-signature-1" tabindex="-1">Get Signature <a class="header-anchor" href="#get-signature-1" aria-label="Permalink to &quot;Get Signature&quot;">​</a></h4><blockquote><p><strong>get</strong> <strong>isPublic</strong>(): <code>null</code> | <code>boolean</code></p></blockquote><p>Defined in: <a href="https://github.com/NoelDeMartin/soukai/blob/408afa028026ad320095ca29531182ce5bfca702/packages/soukai-solid/src/models/mixins/ManagesPermissions.ts#L20" target="_blank" rel="noreferrer">packages/soukai-solid/src/models/mixins/ManagesPermissions.ts:20</a></p><h5 id="returns-2" tabindex="-1">Returns <a class="header-anchor" href="#returns-2" aria-label="Permalink to &quot;Returns&quot;">​</a></h5><p><code>null</code> | <code>boolean</code></p><h2 id="methods" tabindex="-1">Methods <a class="header-anchor" href="#methods" aria-label="Permalink to &quot;Methods&quot;">​</a></h2><h3 id="fetchpublicpermissions" tabindex="-1">fetchPublicPermissions() <a class="header-anchor" href="#fetchpublicpermissions" aria-label="Permalink to &quot;fetchPublicPermissions()&quot;">​</a></h3><blockquote><p><strong>fetchPublicPermissions</strong>(<code>this</code>): <code>Promise</code>&lt;<code>void</code>&gt;</p></blockquote><p>Defined in: <a href="https://github.com/NoelDeMartin/soukai/blob/408afa028026ad320095ca29531182ce5bfca702/packages/soukai-solid/src/models/mixins/ManagesPermissions.ts#L34" target="_blank" rel="noreferrer">packages/soukai-solid/src/models/mixins/ManagesPermissions.ts:34</a></p><h4 id="parameters" tabindex="-1">Parameters <a class="header-anchor" href="#parameters" aria-label="Permalink to &quot;Parameters&quot;">​</a></h4><h5 id="this" tabindex="-1">this <a class="header-anchor" href="#this" aria-label="Permalink to &quot;this&quot;">​</a></h5><p><a href="./SolidModel.html"><code>SolidModel</code></a></p><h4 id="returns-3" tabindex="-1">Returns <a class="header-anchor" href="#returns-3" aria-label="Permalink to &quot;Returns&quot;">​</a></h4><p><code>Promise</code>&lt;<code>void</code>&gt;</p><hr><h3 id="fetchpublicpermissionsifmissing" tabindex="-1">fetchPublicPermissionsIfMissing() <a class="header-anchor" href="#fetchpublicpermissionsifmissing" aria-label="Permalink to &quot;fetchPublicPermissionsIfMissing()&quot;">​</a></h3><blockquote><p><strong>fetchPublicPermissionsIfMissing</strong>(<code>this</code>): <code>Promise</code>&lt;<code>void</code>&gt;</p></blockquote><p>Defined in: <a href="https://github.com/NoelDeMartin/soukai/blob/408afa028026ad320095ca29531182ce5bfca702/packages/soukai-solid/src/models/mixins/ManagesPermissions.ts#L28" target="_blank" rel="noreferrer">packages/soukai-solid/src/models/mixins/ManagesPermissions.ts:28</a></p><h4 id="parameters-1" tabindex="-1">Parameters <a class="header-anchor" href="#parameters-1" aria-label="Permalink to &quot;Parameters&quot;">​</a></h4><h5 id="this-1" tabindex="-1">this <a class="header-anchor" href="#this-1" aria-label="Permalink to &quot;this&quot;">​</a></h5><p><a href="./SolidModel.html"><code>SolidModel</code></a></p><h4 id="returns-4" tabindex="-1">Returns <a class="header-anchor" href="#returns-4" aria-label="Permalink to &quot;Returns&quot;">​</a></h4><p><code>Promise</code>&lt;<code>void</code>&gt;</p><hr><h3 id="trackpublicpermissions" tabindex="-1">trackPublicPermissions() <a class="header-anchor" href="#trackpublicpermissions" aria-label="Permalink to &quot;trackPublicPermissions()&quot;">​</a></h3><blockquote><p><code>protected</code> <strong>trackPublicPermissions</strong>(<code>this</code>): <a href="./../interfaces/PermissionsTracker.html"><code>PermissionsTracker</code></a></p></blockquote><p>Defined in: <a href="https://github.com/NoelDeMartin/soukai/blob/408afa028026ad320095ca29531182ce5bfca702/packages/soukai-solid/src/models/mixins/ManagesPermissions.ts#L52" target="_blank" rel="noreferrer">packages/soukai-solid/src/models/mixins/ManagesPermissions.ts:52</a></p><h4 id="parameters-2" tabindex="-1">Parameters <a class="header-anchor" href="#parameters-2" aria-label="Permalink to &quot;Parameters&quot;">​</a></h4><h5 id="this-2" tabindex="-1">this <a class="header-anchor" href="#this-2" aria-label="Permalink to &quot;this&quot;">​</a></h5><p><a href="./SolidModel.html"><code>SolidModel</code></a></p><h4 id="returns-5" tabindex="-1">Returns <a class="header-anchor" href="#returns-5" aria-label="Permalink to &quot;Returns&quot;">​</a></h4><p><a href="./../interfaces/PermissionsTracker.html"><code>PermissionsTracker</code></a></p><hr><h3 id="updatepublicpermissions" tabindex="-1">updatePublicPermissions() <a class="header-anchor" href="#updatepublicpermissions" aria-label="Permalink to &quot;updatePublicPermissions()&quot;">​</a></h3><blockquote><p><strong>updatePublicPermissions</strong>(<code>this</code>, <code>permissions</code>): <code>Promise</code>&lt;<code>void</code>&gt;</p></blockquote><p>Defined in: <a href="https://github.com/NoelDeMartin/soukai/blob/408afa028026ad320095ca29531182ce5bfca702/packages/soukai-solid/src/models/mixins/ManagesPermissions.ts#L44" target="_blank" rel="noreferrer">packages/soukai-solid/src/models/mixins/ManagesPermissions.ts:44</a></p><h4 id="parameters-3" tabindex="-1">Parameters <a class="header-anchor" href="#parameters-3" aria-label="Permalink to &quot;Parameters&quot;">​</a></h4><h5 id="this-3" tabindex="-1">this <a class="header-anchor" href="#this-3" aria-label="Permalink to &quot;this&quot;">​</a></h5><p><a href="./SolidModel.html"><code>SolidModel</code></a></p><h5 id="permissions" tabindex="-1">permissions <a class="header-anchor" href="#permissions" aria-label="Permalink to &quot;permissions&quot;">​</a></h5><p><code>SolidDocumentPermission</code>[]</p><h4 id="returns-6" tabindex="-1">Returns <a class="header-anchor" href="#returns-6" aria-label="Permalink to &quot;Returns&quot;">​</a></h4><p><code>Promise</code>&lt;<code>void</code>&gt;</p>',63)]))}const b=a(r,[["render",t]]);export{m as __pageData,b as default};
