import * as vscode from 'vscode';
import { HoverRequest, LanguageClient } from 'vscode-languageclient';

export class SignatureHelpProvider implements vscode.SignatureHelpProvider {
  private languageClient: LanguageClient;
  private previousFunctionPosition?: vscode.Position;

  constructor(lc: LanguageClient) {
    this.languageClient = lc;
  }

  public provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.SignatureHelpContext,
  ): vscode.ProviderResult<vscode.SignatureHelp> {
    // the current signature help provider uses the hover information from RLS
    // and it only has a string representation of the function signature.
    // This check makes sure we can easily show the tooltip for multiple parameters, separated by `,`
    if (context.triggerCharacter === '(') {
      this.previousFunctionPosition = position;
      return this.provideHover(
        this.languageClient,
        document,
        position,
        token,
      ).then(hover => this.hoverToSignatureHelp(hover));
    } else if (context.triggerCharacter === ',') {
      if (
        this.previousFunctionPosition &&
        position.line === this.previousFunctionPosition.line
      ) {
        return this.provideHover(
          this.languageClient,
          document,
          this.previousFunctionPosition,
          token,
        ).then(hover => this.hoverToSignatureHelp(hover));
      } else {
        return null;
      }
    } else {
      if (context.isRetrigger === false) {
        this.previousFunctionPosition = undefined;
      }
      return null;
    }
  }

  private provideHover(
    lc: LanguageClient,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover> {
    return new Promise((resolve, reject) => {
      lc.sendRequest(
        HoverRequest.type,
        lc.code2ProtocolConverter.asTextDocumentPositionParams(
          document,
          position.translate(0, -1),
        ),
        token,
      ).then(
        data => resolve(lc.protocol2CodeConverter.asHover(data)),
        error => reject(error),
      );
    });
  }

  private hoverToSignatureHelp(
    hover: vscode.Hover,
  ): vscode.SignatureHelp | undefined {
    /*
    The contents of a hover result has the following structure:
    contents:Array[2]
        0:Object
            value:"
            ```rust
            pub fn write(output: &mut dyn Write, args: Arguments) -> Result
            ```
            "
        1:Object
            value:"The `write` function takes an output stream, and an `Arguments` struct
            that can be precompiled with the `format_args!` macro.
            The arguments will be formatted according to the specified format string
            into the output stream provided.
            # Examples
    RLS uses the function below to create the tooltip contents shown above:
    fn create_tooltip(
        the_type: String,
        doc_url: Option<String>,
        context: Option<String>,
        docs: Option<String>,
    ) -> Vec<MarkedString> {}
    This means the first object is the type - function signature,
    but for the following, there is no way of certainly knowing which is the
    function documentation that we want to display in the tooltip.

    Assuming the context is never populated for a function definition (this might be wrong
    and needs further validation, but initial tests show it to hold true in most cases), and
    we also assume that most functions contain rather documentation, than just a URL without
    any inline documentation, we check the length of contents, and we assume that if there are:
        - two objects, they are the signature and docs, and docs is contents[1]
        - three objects, they are the signature, URL and docs, and docs is contents[2]
        - four objects -- all of them,  docs is contents[3]
    See https://github.com/rust-lang/rls/blob/master/rls/src/actions/hover.rs#L487-L508.
    */

    // we remove the markdown formatting for the label, as it only accepts strings
    const label = (hover.contents[0] as vscode.MarkdownString).value
      .replace('```rust', '')
      .replace('```', '');

    // the signature help tooltip is activated on `(` or `,`
    // and without this, it could show the tooltip after non-functions
    if (!label.includes('fn')) {
      return undefined;
    }

    const doc =
      hover.contents.length > 1
        ? (hover.contents.slice(-1)[0] as vscode.MarkdownString)
        : undefined;
    const si = new vscode.SignatureInformation(label, doc);

    // without parsing the function definition, we don't have a way to get more info on parameters.
    // If RLS supports signature help requests in the future, we can update this.
    si.parameters = [];

    const sh = new vscode.SignatureHelp();
    sh.signatures[0] = si;
    sh.activeSignature = 0;

    return sh;
  }
}
