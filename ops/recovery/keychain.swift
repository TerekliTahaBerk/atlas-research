// Atlas G2 only. Secret input/output MUST stay in pipes, never terminal logs.
import Foundation
import Security
let service = "AtlasResearch.G2.hgngonpirctrwbckhbmy.2026-11-02"
let account = NSUserName()
let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
 kSecAttrService as String: service, kSecAttrAccount as String: account,
 kSecAttrSynchronizable as String: false]
guard CommandLine.arguments.count == 2 else { exit(64) }
if CommandLine.arguments[1] == "put" {
 let secret = FileHandle.standardInput.readDataToEndOfFile()
 guard secret.count > 0 && secret.count < 8192 else { exit(64) }
 var attributes = query
 attributes[kSecValueData as String] = secret
 attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
 let status = SecItemAdd(attributes as CFDictionary, nil)
 guard status == errSecSuccess else { exit(status == errSecDuplicateItem ? 45 : 46) }
} else if CommandLine.arguments[1] == "get" {
 var request = query
 request[kSecReturnData as String] = true
 request[kSecMatchLimit as String] = kSecMatchLimitOne
 var result: CFTypeRef?
 let status = SecItemCopyMatching(request as CFDictionary, &result)
 guard status == errSecSuccess, let secret = result as? Data else { exit(status == errSecItemNotFound ? 44 : 46) }
 FileHandle.standardOutput.write(secret)
} else { exit(64) }
